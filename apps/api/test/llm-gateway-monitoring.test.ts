import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * 监控配置一致性（M5, PRD 11）。
 *
 * 为什么要有这组测试：告警表达式与看板都是**字符串**，写错指标名不会被任何
 * 类型检查拦住——Prometheus 只会静默地永远不触发。这里做三件事：
 * 1. 规则/看板引用的指标名必须真的在 `LlmGatewayMetrics` 里注册（防拼写错）；
 * 2. 已注册的指标至少要被规则或看板引用一次（防"加了指标忘了监控"）；
 * 3. 接线（prometheus rule_files / compose 挂载 / Grafana provisioning）都在位。
 */

const METRICS_SOURCE =
  "../../packages/server/src/llm-gateway/llm-gateway.metrics.ts";
const RULES_FILE = "../../infra/monitoring/rules/llm-gateway-alerts.yml";
const PROMETHEUS_CONFIG = "../../infra/monitoring/prometheus.production.yml";
const COMPOSE_FILE = "../../compose.production.yaml";
const DASHBOARD_FILE =
  "../../infra/monitoring/grafana/provisioning/dashboards/llm-gateway.json";
const DATASOURCES_FILE =
  "../../infra/monitoring/grafana/provisioning/datasources/prometheus.yml";

async function registeredMetricNames(): Promise<Set<string>> {
  const source = await readFile(METRICS_SOURCE, "utf8");
  const names = [...source.matchAll(/name:\s*"(ai_hub_llm_[a-z_]+)"/gu)].map(
    (match) => match[1] as string,
  );
  return new Set(names);
}

function referencedMetricNames(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/ai_hub_llm_[a-z_]+/gu)]
      .map((match) =>
        // 直方图在 PromQL 里以 _bucket/_count/_sum 出现（histogram_quantile 必需），
        // 比对时归一化回注册名
        match[0].replace(/_(bucket|count|sum)$/u, ""),
      )
      // 注释里的 `ai_hub_llm_gateway_*` 这类通配写法会匹配到残缺前缀，排除
      .filter((name) => !name.endsWith("_")),
  );
}

describe("LLM 网关监控配置（PRD 11）", () => {
  it("告警与看板只引用已注册的指标名", async () => {
    const registered = await registeredMetricNames();
    expect(registered.size).toBeGreaterThanOrEqual(8);

    const rules = await readFile(RULES_FILE, "utf8");
    const dashboard = await readFile(DASHBOARD_FILE, "utf8");

    for (const name of referencedMetricNames(rules)) {
      expect(registered, `告警规则引用了未注册的指标 ${name}`).toContain(name);
    }
    for (const name of referencedMetricNames(dashboard)) {
      expect(registered, `看板引用了未注册的指标 ${name}`).toContain(name);
    }
  });

  it("每个已注册指标都至少被规则或看板覆盖", async () => {
    const registered = await registeredMetricNames();
    const rules = await readFile(RULES_FILE, "utf8");
    const dashboard = await readFile(DASHBOARD_FILE, "utf8");
    const covered = new Set([
      ...referencedMetricNames(rules),
      ...referencedMetricNames(dashboard),
    ]);

    for (const name of registered) {
      expect(covered, `指标 ${name} 未被任何告警或面板引用`).toContain(name);
    }
  });

  it("PRD 11.2 五条告警齐备且带严重级别", async () => {
    const rules = await readFile(RULES_FILE, "utf8");

    for (const alertName of [
      "AiHubLlmGatewayErrorRateHigh",
      "AiHubLlmGatewayCircuitOpen",
      "AiHubLlmGatewayUpstreamUnavailable",
      "AiHubLlmGatewayRateLimitedFrequent",
      "AiHubLlmGatewayQuotaNearlyExhausted",
    ]) {
      expect(rules, `缺少告警 ${alertName}`).toContain(alertName);
    }
    // 每条规则都要挂 category 便于 Alertmanager 分组
    const alertBlocks = rules.split("- alert:").slice(1);
    expect(alertBlocks.length).toBeGreaterThanOrEqual(5);
    for (const block of alertBlocks) {
      expect(block).toContain("severity:");
      expect(block).toContain("category: llm-gateway");
      expect(block).toContain("expr:");
      expect(block).toContain("summary:");
    }
  });

  it("Prometheus 加载规则文件，且 compose 挂载了它", async () => {
    const prometheus = await readFile(PROMETHEUS_CONFIG, "utf8");
    expect(prometheus).toContain(
      "/etc/prometheus/rules/llm-gateway-alerts.yml",
    );

    const compose = await readFile(COMPOSE_FILE, "utf8");
    expect(compose).toContain(
      "./infra/monitoring/rules/llm-gateway-alerts.yml:/etc/prometheus/rules/llm-gateway-alerts.yml:ro",
    );
  });

  it("看板 JSON 结构合法且 datasource 名称与 provisioning 一致", async () => {
    const dashboard = await readFile(DASHBOARD_FILE, "utf8");
    const parsed = JSON.parse(dashboard) as {
      panels: Array<{
        datasource?: unknown;
        targets: Array<{ expr?: string }>;
        title: string;
        type: string;
      }>;
      title: string;
      uid: string;
    };

    expect(parsed.uid).toBe("ai-hub-llm-gateway");
    expect(parsed.panels.length).toBeGreaterThanOrEqual(6);

    const datasources = await readFile(DATASOURCES_FILE, "utf8");
    const datasourceName = /name:\s*(\w+)/u.exec(datasources)?.[1];

    for (const panel of parsed.panels) {
      expect(panel.title).not.toBe("");
      expect(panel.datasource).toBe(datasourceName);
      expect(panel.targets.length).toBeGreaterThan(0);
      for (const target of panel.targets) {
        expect(target.expr).toBeTruthy();
      }
    }
  });

  it("看板 provisioning 目录已声明（Grafana 才能加载）", async () => {
    const provider = await readFile(
      "../../infra/monitoring/grafana/provisioning/dashboards/dashboards.yml",
      "utf8",
    );
    expect(provider).toContain("apiVersion: 1");
    expect(provider).toContain("path: /etc/grafana/provisioning/dashboards");

    // compose 已把整个 provisioning 目录挂进容器（无需为看板单独加挂载）
    const compose = await readFile(COMPOSE_FILE, "utf8");
    expect(compose).toContain(
      "./infra/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro",
    );
  });
});
