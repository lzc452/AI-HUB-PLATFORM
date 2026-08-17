import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuditExport } from "./useSecurityAudit";

const hoisted = vi.hoisted(() => ({
  createAuditExport: vi.fn(),
  downloadAuditExport: vi.fn(),
  fetchAuditExportStatus: vi.fn(),
}));

vi.mock("./security.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./security.client")>();
  return {
    ...actual,
    createAuditExport: hoisted.createAuditExport,
    downloadAuditExport: hoisted.downloadAuditExport,
    fetchAuditExportStatus: hoisted.fetchAuditExportStatus,
  };
});

function statusOf(
  overrides: Partial<{
    status: string;
    failureCode: string | null;
    expiresAt: string | null;
  }> = {},
) {
  return {
    exportId: "job-1",
    status: "processing",
    resultStorageKey: null,
    failureCode: null,
    expiresAt: null,
    createdAt: "2026-08-16T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("useAuditExport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.createAuditExport.mockReset();
    hoisted.downloadAuditExport.mockReset();
    hoisted.fetchAuditExportStatus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("创建任务后轮询到 completed 并提供下载", async () => {
    hoisted.createAuditExport.mockResolvedValue({
      accepted: true,
      exportJobId: "job-1",
      status: "queued",
    });
    hoisted.fetchAuditExportStatus
      .mockResolvedValueOnce(statusOf())
      .mockResolvedValueOnce(
        statusOf({
          status: "completed",
          expiresAt: "2026-08-23T00:00:00.000Z",
        }),
      );
    hoisted.downloadAuditExport.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuditExport());

    await act(async () => {
      await result.current.startExport({ module: "security" });
    });
    expect(result.current.state).toMatchObject({ phase: "polling" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.state).toMatchObject({ phase: "polling" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.state).toMatchObject({
      phase: "completed",
      exportJobId: "job-1",
    });

    await act(async () => {
      await result.current.download("job-1");
    });
    expect(hoisted.downloadAuditExport).toHaveBeenCalledWith("job-1");
  });

  it("failed 任务不提供下载入口并保留 failureCode", async () => {
    hoisted.createAuditExport.mockResolvedValue({
      accepted: true,
      exportJobId: "job-2",
      status: "queued",
    });
    hoisted.fetchAuditExportStatus.mockResolvedValueOnce(
      statusOf({
        status: "failed",
        failureCode: "Forbidden: Operation is not allowed for this key.",
      }),
    );

    const { result } = renderHook(() => useAuditExport());
    await act(async () => {
      await result.current.startExport({});
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.state).toMatchObject({
      phase: "failed",
      exportJobId: "job-2",
      failureCode: "Forbidden: Operation is not allowed for this key.",
    });
    expect(hoisted.downloadAuditExport).not.toHaveBeenCalled();
  });

  it("已过期任务按 expired 处理", async () => {
    hoisted.createAuditExport.mockResolvedValue({
      accepted: true,
      exportJobId: "job-3",
      status: "queued",
    });
    hoisted.fetchAuditExportStatus.mockResolvedValueOnce(
      statusOf({
        status: "completed",
        expiresAt: "2026-08-15T00:00:00.000Z",
      }),
    );

    const { result } = renderHook(() => useAuditExport());
    await act(async () => {
      await result.current.startExport({});
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.state).toMatchObject({
      phase: "expired",
      exportJobId: "job-3",
    });
  });
});
