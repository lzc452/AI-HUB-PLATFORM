import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("identity administration routes", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/");
  });

  it("exposes organization and security administration routes", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("link", { name: /Organization/ }));
    expect(
      await screen.findByRole("heading", { name: "Organization" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Security/ }));
    expect(
      await screen.findByRole("heading", { name: "Security" }),
    ).toBeInTheDocument();
  });
});
