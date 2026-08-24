import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { setSession } from "./modules/auth/session.store";

describe("authentication", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/console/marketplace");
  });

  afterEach(() => {
    cleanup();
    setSession(null);
    vi.unstubAllGlobals();
  });

  it("redirects unauthenticated users to the login page", async () => {
    setSession(null);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "欢迎登录" }),
    ).toBeInTheDocument();
    expect(globalThis.window.location.pathname).toBe("/console/login");
    expect(
      new URLSearchParams(globalThis.window.location.search).get("returnTo"),
    ).toBe("/console/marketplace");
  });

  it("preserves query and hash while redirecting a protected deep link", async () => {
    setSession(null);
    globalThis.window.history.pushState(
      {},
      "",
      "/console/applications/app-1?tab=delivery#web",
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "欢迎登录" }),
    ).toBeInTheDocument();
    expect(
      new URLSearchParams(globalThis.window.location.search).get("returnTo"),
    ).toBe("/console/applications/app-1?tab=delivery#web");
  });

  it("validates the login form before submitting", async () => {
    setSession(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    globalThis.window.history.pushState({}, "", "/console/login");

    render(<App />);

    await act(async () => {
      fireEvent.submit(await screen.findByRole("form", { name: "登录表单" }));
    });

    expect(await screen.findByText("请输入工号或邮箱")).toBeInTheDocument();
    expect(await screen.findByText("请输入密码")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an API error when login fails", async () => {
    setSession(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { code: "INVALID_CREDENTIALS", detail: "工号或密码错误" },
          { status: 401 },
        ),
      ),
    );
    globalThis.window.history.pushState({}, "", "/console/login");

    render(<App />);

    fireEvent.change(await screen.findByLabelText("工号"), {
      target: { value: "E0001" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong-password" },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: "登录表单" }));
    });

    expect(await screen.findByText(/工号或密码错误/)).toBeInTheDocument();
  });
});
