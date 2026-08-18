import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SlaCountdown } from "./SlaCountdown";

describe("SlaCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("显示剩余时间并每秒刷新", () => {
    render(<SlaCountdown dueAt="2026-08-17T10:00:10.000Z" />);
    expect(screen.getByText("00:00:10")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("00:00:08")).toBeInTheDocument();
  });

  it("超过截止时间显示已超时", () => {
    render(<SlaCountdown dueAt="2026-08-17T09:59:00.000Z" />);
    expect(screen.getByText("已超时")).toBeInTheDocument();
  });

  it("卸载后清除定时器", () => {
    const { unmount } = render(
      <SlaCountdown dueAt="2026-08-18T10:00:00.000Z" />,
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
