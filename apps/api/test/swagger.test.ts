import { describe, expect, it } from "vitest";
import { shouldEnableApiDocs } from "../src/swagger.js";

describe("shouldEnableApiDocs", () => {
  it("enables API docs in development and test environments by default", () => {
    expect(shouldEnableApiDocs("development", false)).toBe(true);
    expect(shouldEnableApiDocs("test", false)).toBe(true);
  });

  it("disables API docs in production unless explicitly enabled", () => {
    expect(shouldEnableApiDocs("production", false)).toBe(false);
    expect(shouldEnableApiDocs("production", true)).toBe(true);
  });
});
