import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production proxy security configuration", () => {
  it("terminates TLS and emits boundary security headers", async () => {
    const config = await readFile(
      "../../infra/docker/nginx.production.conf",
      "utf8",
    );

    expect(config).toContain("listen 443 ssl");
    expect(config).toContain("ssl_certificate");
    expect(config).toContain("Strict-Transport-Security");
    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain("X-Content-Type-Options");
    expect(config).toContain("X-Frame-Options");
    expect(config).toContain("return 308 https://");
  });
});
