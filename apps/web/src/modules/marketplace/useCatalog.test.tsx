import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../shared/api/client";
import { useSaveRiskDescription } from "./useCatalog";

const hoisted = vi.hoisted(() => ({
  saveRiskDescription: vi.fn(),
  showErrorMessage: vi.fn(),
  showSuccessMessage: vi.fn(),
}));

vi.mock("./marketplace.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./marketplace.client")>();
  return {
    ...actual,
    saveRiskDescription: hoisted.saveRiskDescription,
  };
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

describe("useSaveRiskDescription", () => {
  beforeEach(() => {
    hoisted.saveRiskDescription.mockReset();
    hoisted.showErrorMessage.mockReset();
    hoisted.showSuccessMessage.mockReset();
  });

  it("保存风险说明后失效对应 risk 查询并提示成功", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    hoisted.saveRiskDescription.mockResolvedValue({
      riskDescription: "新的风险说明",
    });
    const { result } = renderHook(() => useSaveRiskDescription("app-risk"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("新的风险说明");
    });

    expect(hoisted.saveRiskDescription).toHaveBeenCalledWith(
      "app-risk",
      "新的风险说明",
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["catalog", "risk", "app-risk"],
    });
    expect(hoisted.showSuccessMessage).toHaveBeenCalledWith("风险说明已保存");
  });

  it("保存失败时提示错误", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const cause = new ApiError(500, "INTERNAL", "服务暂不可用", "trace-1");
    hoisted.saveRiskDescription.mockRejectedValue(cause);
    const { result } = renderHook(() => useSaveRiskDescription("app-risk"), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.mutate("新的风险说明");
    });

    await waitFor(() =>
      expect(hoisted.showErrorMessage).toHaveBeenCalledWith(
        cause,
        "保存风险说明失败",
      ),
    );
    expect(hoisted.showSuccessMessage).not.toHaveBeenCalled();
  });
});
