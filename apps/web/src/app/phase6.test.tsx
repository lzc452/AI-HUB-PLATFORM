import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("Phase 6 analytics dashboard shell", () => {
  beforeEach(() => {
    globalThis.window.history.pushState({}, "", "/analytics");
  });

  it("shows fixed dashboard groups and the raw-event rebuild boundary", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Analytics dashboards" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Application")).toBeInTheDocument();
    expect(screen.getByText("Innovation")).toBeInTheDocument();
    expect(
      screen.getByText(/Numbers are rebuildable from retained raw events/),
    ).toBeInTheDocument();
  });
});
