import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("development proxy configuration", () => {
  it("resolves replaceable Docker upstreams dynamically", async () => {
    const config = await readFile("../../infra/docker/nginx.conf", "utf8");

    expect(config).toContain("resolver 127.0.0.11");
    expect(config).toContain('set $api_upstream "api:3001";');
    expect(config).toContain('set $web_upstream "${WEB_UPSTREAM}";');
    expect(config).toContain("proxy_pass http://$api_upstream;");
    expect(config).toContain("proxy_pass http://$web_upstream;");
    expect(config).toContain("location /console/");
    expect(config).toContain("return 308 /console$request_uri;");
  });

  it("serves Console SPA and hashed assets with separate cache policies", async () => {
    const config = await readFile("../../infra/docker/web.nginx.conf", "utf8");

    expect(config).toContain("location = /console/");
    expect(config).toContain("location /console/assets/");
    expect(config).toContain('Cache-Control "no-cache"');
    expect(config).toContain(
      'Cache-Control "public, max-age=31536000, immutable"',
    );
    expect(config).toContain("try_files $uri $uri/ @console_index;");
  });
});

describe("模型网关代理配置（/v1，OpenAI 兼容端点）", () => {
  // 实测依据：默认 proxy_read_timeout 60s 时，上游空闲 70s 的连接在 +60.07s 被
  // nginx 切断；改为 300s 后存活。缺失该 location 时请求会落到 web 上游。
  // 详见 docs/audit/api-platform-landform-verification-2026-10-13.md
  for (const configPath of [
    "../../infra/docker/nginx.conf",
    "../../infra/docker/nginx.production.conf",
  ]) {
    it(`${configPath} 暴露 /v1 并放宽读超时、关闭响应缓冲`, async () => {
      const config = await readFile(configPath, "utf8");

      expect(config).toContain("location /v1/");
      expect(config).toContain("proxy_read_timeout 300s;");
      expect(config).toContain("proxy_send_timeout 300s;");
      expect(config).toContain("proxy_buffering off;");
      expect(config).toContain("proxy_cache off;");
      expect(config).toContain('proxy_set_header Connection "";');
    });
  }

  it("生产配置不对 /v1 套用边缘限流（其 503 会破坏 OpenAI 错误信封）", async () => {
    const config = await readFile(
      "../../infra/docker/nginx.production.conf",
      "utf8",
    );
    const start = config.indexOf("location /v1/");
    expect(start).toBeGreaterThan(-1);
    const block = config.slice(start, config.indexOf("}", start));

    expect(block).not.toContain("limit_req");
  });
});
