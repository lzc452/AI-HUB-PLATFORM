import { describe, expect, it } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";

import { toProblemDetails } from "./problem-details.filter.js";

describe("toProblemDetails - 中危-5 detail 回显转义", () => {
  it("将 detail 中的 HTML 标签转义，阻止反射型 XSS 载荷外泄", () => {
    const exception = new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        detail: "<script>alert(1)</script><img src=x onerror=alert(2)>",
      },
      HttpStatus.BAD_REQUEST,
    );

    const problem = toProblemDetails(exception, "trace-1");

    expect(problem.message).toContain("&lt;script&gt;");
    expect(problem.message).not.toContain("<script>");
    expect(problem.message).toContain("&lt;img");
    expect(problem.message).not.toContain("<img");
  });

  it("保留属性/事件处理器字符的转义，避免 onerror 等被还原", () => {
    const exception = new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        detail: '<a href="javascript:alert(1)">x</a>',
      },
      HttpStatus.BAD_REQUEST,
    );

    const problem = toProblemDetails(exception, "trace-2");

    expect(problem.message).not.toContain("<a ");
    expect(problem.message).toContain("&lt;a");
  });

  it("无 detail 时回落到固定 title，不泄露内部信息", () => {
    const exception = new HttpException(
      { statusCode: HttpStatus.BAD_REQUEST },
      HttpStatus.BAD_REQUEST,
    );

    const problem = toProblemDetails(exception, "trace-3");

    expect(problem.message).toBe("Bad Request");
  });

  it("字符串响应体中的 HTML 同样被转义（覆盖 response 为字符串的路径）", () => {
    const exception = new HttpException(
      "<img src=x onerror=alert(1)>",
      HttpStatus.BAD_REQUEST,
    );

    const problem = toProblemDetails(exception, "trace-3b");

    expect(problem.message).not.toContain("<img");
    expect(problem.message).toContain("&lt;img");
  });

  it("既有常量 detail（如草稿提交校验）原样透传、不被误伤", () => {
    const exception = new HttpException(
      { statusCode: HttpStatus.BAD_REQUEST, detail: "草稿未通过提交校验" },
      HttpStatus.BAD_REQUEST,
    );

    const problem = toProblemDetails(exception, "trace-4");

    expect(problem.message).toBe("草稿未通过提交校验");
  });

  it("仅含安全域名 code 时回显 code，否则回落固定 code", () => {
    const okException = new HttpException(
      { statusCode: HttpStatus.BAD_REQUEST, code: "DRAFT_INVALID" },
      HttpStatus.BAD_REQUEST,
    );
    const badException = new HttpException(
      { statusCode: HttpStatus.BAD_REQUEST, code: "not a code!" },
      HttpStatus.BAD_REQUEST,
    );

    expect(toProblemDetails(okException, "t").code).toBe("DRAFT_INVALID");
    expect(toProblemDetails(badException, "t").code).toBe("BAD_REQUEST");
  });
});
