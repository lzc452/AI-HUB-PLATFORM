import { describe, expect, it } from "vitest";
import {
  estimateUsage,
  extractCompletionDelta,
  extractSseUsage,
  fromUpstreamUsage,
  normalizeModelName,
} from "./llm-usage.js";

describe("上游用量解析", () => {
  it("字段齐全时按上游实测返回（estimated=false）", () => {
    expect(
      fromUpstreamUsage({
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      }),
    ).toEqual({
      promptTokens: 5,
      completionTokens: 2,
      totalTokens: 7,
      estimated: false,
    });
  });

  it("总数缺失时按提示+补全相加，而不是记 0", () => {
    expect(
      fromUpstreamUsage({
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    ).toMatchObject({ totalTokens: 7 });
  });

  it("字段不全或非法时返回 null（不做半真半假的补零）", () => {
    expect(fromUpstreamUsage(undefined)).toBeNull();
    expect(fromUpstreamUsage({})).toBeNull();
    expect(fromUpstreamUsage({ usage: { prompt_tokens: 1 } })).toBeNull();
    expect(
      fromUpstreamUsage({ usage: { prompt_tokens: -1, completion_tokens: 2 } }),
    ).toBeNull();
  });

  it("字符串数字可被解析（部分服务返回字符串计数）", () => {
    expect(
      fromUpstreamUsage({
        usage: { prompt_tokens: "8", completion_tokens: "2" },
      }),
    ).toMatchObject({ promptTokens: 8, completionTokens: 2, totalTokens: 10 });
  });
});

describe("本地估算兜底", () => {
  it("一定带 estimated 标记且数值为正", () => {
    const usage = estimateUsage({
      requestPayload: { messages: [{ role: "user", content: "你好世界" }] },
      completionText: "这是一段回复",
    });
    expect(usage.estimated).toBe(true);
    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
  });

  it("空补全时补全 token 为 0（不虚增）", () => {
    const usage = estimateUsage({ requestPayload: {}, completionText: "" });
    expect(usage.completionTokens).toBe(0);
  });
});

describe("模型名归一化（评审 R2-03）", () => {
  it("优先取上游响应中的 model，其次回退请求值", () => {
    expect(
      normalizeModelName({ responseModel: "served", requestModel: "asked" }),
    ).toBe("served");
    expect(normalizeModelName({ requestModel: "asked" })).toBe("asked");
  });

  it("截断到 64 字符，防止伪造超长模型名撑爆聚合表主键", () => {
    const forged = "x".repeat(500);
    expect(normalizeModelName({ requestModel: forged })).toHaveLength(64);
  });

  it("空值归一为 unknown", () => {
    expect(normalizeModelName({})).toBe("unknown");
    expect(normalizeModelName({ requestModel: "   " })).toBe("unknown");
    expect(normalizeModelName({ requestModel: 42 })).toBe("unknown");
  });
});

describe("SSE 数据行解析", () => {
  it("从末块解析 usage", () => {
    const line = JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
    });
    expect(extractSseUsage(line)).toMatchObject({ totalTokens: 13 });
  });

  it("非 JSON 或缺少 usage 时返回 null（不抛错）", () => {
    expect(extractSseUsage("not-json")).toBeNull();
    expect(extractSseUsage('{"choices":[]}')).toBeNull();
  });

  it("聚合增量内容用于估算补全长度", () => {
    expect(
      extractCompletionDelta(
        JSON.stringify({
          choices: [{ delta: { content: "你" } }, { delta: { content: "好" } }],
        }),
      ),
    ).toBe("你好");
    expect(extractCompletionDelta("not-json")).toBe("");
  });
});
