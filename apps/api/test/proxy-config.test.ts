import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("development proxy configuration", () => {
  it("resolves replaceable Docker upstreams dynamically", async () => {
    const config = await readFile("../../infra/docker/nginx.conf", "utf8");

    expect(config).toContain("resolver 127.0.0.11");
    expect(config).toContain('set $api_upstream "api:3000";');
    expect(config).toContain('set $web_upstream "${WEB_UPSTREAM}";');
    expect(config).toContain("proxy_pass http://$api_upstream;");
    expect(config).toContain("proxy_pass http://$web_upstream;");
  });
});
