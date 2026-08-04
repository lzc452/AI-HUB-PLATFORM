import { describe, expect, it } from "vitest";
import { assertPublicHttpTarget } from "./ssrf-policy.js";

describe("assertPublicHttpTarget", () => {
  it("rejects loopback and cloud metadata targets", async () => {
    await expect(
      assertPublicHttpTarget("http://127.0.0.1/health"),
    ).rejects.toThrow("SSRF_PRIVATE_TARGET");
    await expect(
      assertPublicHttpTarget("http://metadata.google.internal/"),
    ).rejects.toThrow("SSRF_PRIVATE_TARGET");
  });

  it("rejects a public hostname that resolves to a private address", async () => {
    await expect(
      assertPublicHttpTarget("https://example.test/", async () => [
        { address: "10.0.0.4", family: 4 },
      ]),
    ).rejects.toThrow("SSRF_PRIVATE_TARGET");
  });

  it("accepts a public hostname after all resolved addresses are public", async () => {
    await expect(
      assertPublicHttpTarget("https://example.test/", async () => [
        { address: "93.184.216.34", family: 4 },
      ]),
    ).resolves.toEqual(new URL("https://example.test/"));
  });
});
