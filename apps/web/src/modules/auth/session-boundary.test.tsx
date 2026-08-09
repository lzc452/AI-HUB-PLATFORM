import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  clearLastViewedApplicationId,
  readLastViewedApplicationId,
  rememberLastViewedApplicationId,
} from "../application/last-viewed";
import { clearSessionScopedState } from "../../providers";

describe("会话边界缓存", () => {
  it("切换会话时清除 React Query 私有缓存和最近应用入口", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["private", "employee"], { employeeId: "E0001" });
    rememberLastViewedApplicationId("app-old");

    clearSessionScopedState(queryClient);

    expect(queryClient.getQueryData(["private", "employee"])).toBeUndefined();
    expect(readLastViewedApplicationId()).toBeUndefined();
    clearLastViewedApplicationId();
  });
});
