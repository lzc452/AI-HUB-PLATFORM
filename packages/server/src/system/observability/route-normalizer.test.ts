import { describe, expect, it } from "vitest";
import {
  normalizeRouteLabel,
  ROUTE_LABEL_ID,
  ROUTE_LABEL_UNKNOWN,
} from "./route-normalizer.js";

describe("normalizeRouteLabel", () => {
  it("优先采用框架路由模板（模板本身已是低基数形状）", () => {
    expect(
      normalizeRouteLabel(
        "/api/applications/8472-1a2b/review",
        "/api/applications/:applicationId/review",
      ),
    ).toBe("/api/applications/:applicationId/review");
  });

  it("模板是根路径时回退到启发式（根路径模板无区分度）", () => {
    expect(normalizeRouteLabel("/api/applications/42", "/")).toBe(
      "/api/applications/:id",
    );
  });

  it("模板含通配符时回退到启发式", () => {
    expect(normalizeRouteLabel("/static/a.js", "/static/*")).toBe(
      "/static/a.js",
    );
  });

  it("剥离 query string：搜索词/token 绝不能进标签", () => {
    expect(normalizeRouteLabel("/api/applications?name=张三&token=abc")).toBe(
      "/api/applications",
    );
  });

  it("剥离 hash", () => {
    expect(normalizeRouteLabel("/api/docs#section-2")).toBe("/api/docs");
  });

  it("ulid 段替换为 :id（本项目 traceId / 批次号即ULID 格式）", () => {
    expect(
      normalizeRouteLabel(
        "/api/applications/01JZ3M8V9Z3V4F2V3K0R4Y8P6S/review",
      ),
    ).toBe(`/api/applications/${ROUTE_LABEL_ID}/review`);
  });

  it("uuid 段替换为 :id", () => {
    expect(
      normalizeRouteLabel(
        "/api/applications/9f8b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d/review",
      ),
    ).toBe(`/api/applications/${ROUTE_LABEL_ID}/review`);
  });

  it("无连字符的 32 位 uuid 同样识别", () => {
    expect(
      normalizeRouteLabel(
        "/api/applications/9f8b1c2d3e4f4a5b8c9d0e1f2a3b4c5d",
      ),
    ).toBe(`/api/applications/${ROUTE_LABEL_ID}`);
  });

  it("纯数字段替换为 :id", () => {
    expect(normalizeRouteLabel("/api/review-queue/12345")).toBe(
      `/api/review-queue/${ROUTE_LABEL_ID}`,
    );
  });

  it("长十六进制（sha256 / hash）替换为 :id", () => {
    expect(
      normalizeRouteLabel("/api/artifacts/deadbeefcafe0123456789abcdef0123456789abcdef0123456789abcdef"),
    ).toBe(`/api/artifacts/${ROUTE_LABEL_ID}`);
  });

  it("带日期前缀的业务标识替换为 :id", () => {
    expect(normalizeRouteLabel("/api/applications/APP-20260901-8472")).toBe(
      `/api/applications/${ROUTE_LABEL_ID}`,
    );
  });

  it("前缀-长数字形态替换为 :id", () => {
    expect(normalizeRouteLabel("/api/users/user-12345678")).toBe(
      `/api/users/${ROUTE_LABEL_ID}`,
    );
  });

  it("超长单段替换为 :id", () => {
    const token = "a".repeat(80);
    expect(normalizeRouteLabel(`/api/download/${token}`)).toBe(
      `/api/download/${ROUTE_LABEL_ID}`,
    );
  });

  it("保留有语义的静态段（版本号不被误替换）", () => {
    expect(normalizeRouteLabel("/api/v1/applications")).toBe(
      "/api/v1/applications",
    );
  });

  it("保留单词形态的静态段（health / review 等）", () => {
    expect(normalizeRouteLabel("/api/health")).toBe("/api/health");
    expect(normalizeRouteLabel("/api/review")).toBe("/api/review");
  });

  it("混合路径：只替换高基数段，保留静态段", () => {
    expect(normalizeRouteLabel("/api/department/members/E00987")).toBe(
      `/api/department/members/${ROUTE_LABEL_ID}`,
    );
  });

  it("根路径归一为 /", () => {
    expect(normalizeRouteLabel("/")).toBe("/");
  });

  it("空/缺省 url 返回 /unknown 而非抛错", () => {
    expect(normalizeRouteLabel(undefined)).toBe(ROUTE_LABEL_UNKNOWN);
    expect(normalizeRouteLabel(null)).toBe(ROUTE_LABEL_UNKNOWN);
    expect(normalizeRouteLabel("")).toBe(ROUTE_LABEL_UNKNOWN);
  });

  it("超长路径退化为 /unknown（防止标签被撑大）", () => {
    const segments = Array.from({ length: 30 }, (_, i) => `s${i}`);
    expect(normalizeRouteLabel(`/${segments.join("/")}`)).toBe(
      ROUTE_LABEL_UNKNOWN,
    );
  });

  it("非法/非 ASCII URL 不抛错，产出稳定标签", () => {
    // 空格与中文会被 URL 解析器百分号编码（不会抛），标签必须仍然可用。
    const withSpace = normalizeRouteLabel("/api/a b?x=1");
    expect(typeof withSpace).toBe("string");
    expect(withSpace.startsWith("/api/")).toBe(true);

    const withUnicode = normalizeRouteLabel("/api/应用列表?q=张三");
    expect(typeof withUnicode).toBe("string");
    expect(withUnicode.startsWith("/api/")).toBe(true);
  });

  it("非法字符 URL 不抛错（控制字符走 catch 分支手工截断）", () => {
    const label = normalizeRouteLabel("/api/ab?x=1");
    expect(label.startsWith("/api/")).toBe(true);
  });

  it("幂等：归一化结果再次归一化不变（避免二次处理漂移）", () => {
    const once = normalizeRouteLabel("/api/applications/42/review");
    expect(normalizeRouteLabel(once)).toBe(once);
  });

  it("高基数 URL 的归一化结果数量有限（核心不变量）", () => {
    const labels = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      labels.add(
        normalizeRouteLabel(
          `/api/applications/01JZ3M8V9Z3V4F2V3K0R4Y${String(i).padStart(4, "0")}`,
        ),
      );
    }
    // 1000 个各不相同的 UUID 必须收敛到 1 个标签，否则 Prometheus 会被打爆。
    expect(labels.size).toBe(1);
  });
});
