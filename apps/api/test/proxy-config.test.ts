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
