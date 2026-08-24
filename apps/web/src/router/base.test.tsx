import { describe, expect, it } from "vitest";

import {
  CONSOLE_DEFAULT_PATH,
  consoleReturnTo,
  createConsoleSsoCallbackPath,
  resolveLoginReturnTo,
  toConsolePath,
  toConsoleRoute,
} from "./base";

describe("Console base path", () => {
  it("converts internal routes to browser paths without duplicating basename", () => {
    expect(toConsolePath("/applications/app-1?tab=versions#latest")).toBe(
      "/console/applications/app-1?tab=versions#latest",
    );
    expect(toConsolePath("/console/marketplace")).toBe("/console/marketplace");
  });

  it("preserves pathname, query and hash for authentication returnTo", () => {
    expect(
      consoleReturnTo({
        pathname: "/applications/app-1",
        search: "?tab=delivery",
        hash: "#web",
      }),
    ).toBe("/console/applications/app-1?tab=delivery#web");
  });

  it("resolves a console deep link to an internal Router route", () => {
    const search = new URLSearchParams({
      returnTo: "/console/applications/app-1?tab=delivery#web",
    });

    expect(resolveLoginReturnTo(`?${search.toString()}`)).toBe(
      "/applications/app-1?tab=delivery#web",
    );
    expect(toConsoleRoute("/console/marketplace")).toBe("/marketplace");
  });

  it("rejects cross-site and recursive login destinations", () => {
    const unsafe = new URLSearchParams({ returnTo: "https://evil.example" });
    const recursive = new URLSearchParams({ returnTo: "/console/login" });

    expect(resolveLoginReturnTo(`?${unsafe.toString()}`)).toBe("/marketplace");
    expect(resolveLoginReturnTo(`?${recursive.toString()}`)).toBe(
      "/marketplace",
    );
    expect(toConsolePath("//evil.example/path")).toBe(CONSOLE_DEFAULT_PATH);
  });

  it("builds an SSO handoff callback that retains the final destination", () => {
    const callback = createConsoleSsoCallbackPath(
      "/console/analytics?range=30d#trend",
    );
    const callbackUrl = new URL(callback, "https://ai-hub.example");

    expect(callbackUrl.pathname).toBe("/console/login");
    expect(callbackUrl.searchParams.get("sso")).toBe("complete");
    expect(callbackUrl.searchParams.get("returnTo")).toBe(
      "/console/analytics?range=30d#trend",
    );
  });
});
