import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../shared/api/client";
import { useSubmitApplicationReview } from "./useApplication";

const hoisted = vi.hoisted(() => ({
  showErrorMessage: vi.fn(),
  showSuccessMessage: vi.fn(),
  submitReview: vi.fn(),
}));

vi.mock("./application.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./application.client")>();
  return { ...actual, submitApplicationReview: hoisted.submitReview };
});

vi.mock("../../shared/ui/message", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../shared/ui/message")>();
  return {
    ...actual,
    showErrorMessage: hoisted.showErrorMessage,
    showSuccessMessage: hoisted.showSuccessMessage,
  };
});

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useSubmitApplicationReview", () => {
  beforeEach(() => {
    hoisted.showErrorMessage.mockReset();
    hoisted.showSuccessMessage.mockReset();
    hoisted.submitReview.mockReset();
  });

  it("提交版本并失效所有发布链缓存域", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    hoisted.submitReview.mockResolvedValue({ applicationId: "app-001" });
    const { result } = renderHook(() => useSubmitApplicationReview(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        applicationVersionId: "version-latest",
      });
    });

    expect(hoisted.submitReview).toHaveBeenCalledWith("version-latest");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["creator"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["catalog"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["applications"] });
    expect(hoisted.showSuccessMessage).toHaveBeenCalledWith("版本已提交审核");
  });

  it("确认接受未签名风险后透传 acceptUnsigned", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    hoisted.submitReview.mockResolvedValue({ applicationId: "app-001" });
    const { result } = renderHook(() => useSubmitApplicationReview(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        applicationVersionId: "version-latest",
        acceptUnsigned: true,
      });
    });

    expect(hoisted.submitReview).toHaveBeenCalledWith("version-latest", {
      acceptUnsigned: true,
    });
  });

  it("将后端领域 code 转换为可操作提示", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    hoisted.submitReview.mockRejectedValue(
      new ApiError(400, "APPLICATION_OWNER_REQUIRED", undefined, "trace-1"),
    );
    const { result } = renderHook(() => useSubmitApplicationReview(), {
      wrapper: createWrapper(queryClient),
    });

    act(() =>
      result.current.mutate({ applicationVersionId: "version-latest" }),
    );

    await waitFor(() =>
      expect(hoisted.showErrorMessage).toHaveBeenCalledWith(
        "仅应用负责人可以执行此操作（追踪 ID：trace-1）",
        "提交版本审核失败",
      ),
    );
  });

  it("未签名制品未确认时后端仍返回确认错误提示", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    hoisted.submitReview.mockRejectedValue(
      new ApiError(
        400,
        "UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION",
        undefined,
        "trace-3",
      ),
    );
    const { result } = renderHook(() => useSubmitApplicationReview(), {
      wrapper: createWrapper(queryClient),
    });

    act(() =>
      result.current.mutate({ applicationVersionId: "version-latest" }),
    );

    await waitFor(() =>
      expect(hoisted.showErrorMessage).toHaveBeenCalledWith(
        "制品未签名，请勾选确认接受风险后再操作（追踪 ID：trace-3）",
        "提交版本审核失败",
      ),
    );
  });
});
