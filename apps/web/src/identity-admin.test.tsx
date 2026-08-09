import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("identity administration routes", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/");
  });

  it("exposes organization and security administration routes", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("link", { name: /组织管理/ }));
    expect(
      await screen.findByRole("heading", { name: "组织管理" }),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("link", { name: /系统安全/ }));
    expect(
      await screen.findByRole("heading", { name: "系统安全" }),
    ).toBeInTheDocument();
  });
});
