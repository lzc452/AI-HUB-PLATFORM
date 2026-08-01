import { describe, expect, it } from "vitest";

import { createApplicationLogger, sanitizeLogValue } from "./logger.js";

describe("sanitizeLogValue", () => {
  it("creates a logger with valid redaction paths", () => {
    expect(() => createApplicationLogger("info")).not.toThrow();
  });

  it("redacts secrets and connection strings recursively", () => {
    const sanitized = sanitizeLogValue({
      authorization: "Bearer top-secret",
      nested: {
        password: "do-not-log",
        message: "connect postgres://user:password@postgres:5432/ai_hub",
      },
    });
    const output = JSON.stringify(sanitized);

    expect(output).not.toContain("top-secret");
    expect(output).not.toContain("do-not-log");
    expect(output).not.toContain("user:password");
    expect(output).toContain("[Redacted]");
  });
});
