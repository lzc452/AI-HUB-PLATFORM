import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../shared/api/client";
import {
  showErrorMessage,
  showSuccessMessage,
  showWarningMessage,
} from "../../shared/ui/message";
import { useAuth } from "../auth/useAuth";
import {
  disableAdminKey,
  enableAdminKey,
  getMyUsage,
  getPlatformUsage,
  listAdminKeys,
  listMyCalls,
  type AdminKeyListQuery,
  type AdminUsageQuery,
  type CallListQuery,
  type UsageQuery,
} from "./model-service.client";

/**
 * 模型服务 Console 数据 hooks。
 *
 * 查询 key 均带 `session.employeeId`：数据权限由后端按会话锁定，账号切换后
 * 旧账号缓存不应继续渲染（与 analytics 模块同口径）。
 * `enabled` 由调用方按权限传入——无权限时不发请求，页面走「无权限」引导而不是错误态。
 */

export function useMyUsage(query: UsageQuery, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    enabled,
    queryFn: () => getMyUsage(query),
    queryKey: [
      "model-service",
      "my-usage",
      session?.employeeId ?? null,
      query.range ?? null,
      query.from ?? null,
      query.to ?? null,
    ],
  });
}

export function useMyCalls(query: CallListQuery, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    enabled,
    queryFn: () => listMyCalls(query),
    queryKey: [
      "model-service",
      "my-calls",
      session?.employeeId ?? null,
      query.range ?? null,
      query.from ?? null,
      query.to ?? null,
      query.keyId ?? null,
      query.model ?? null,
      query.errorOnly ?? null,
      query.page ?? null,
      query.pageSize ?? null,
    ],
  });
}

export function usePlatformUsage(query: AdminUsageQuery, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    enabled,
    queryFn: () => getPlatformUsage(query),
    queryKey: [
      "model-service",
      "platform-usage",
      session?.employeeId ?? null,
      query.range ?? null,
      query.from ?? null,
      query.to ?? null,
      query.employeeId ?? null,
    ],
  });
}

export function useAdminKeys(query: AdminKeyListQuery, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    enabled,
    queryFn: () => listAdminKeys(query),
    queryKey: [
      "model-service",
      "admin-keys",
      session?.employeeId ?? null,
      query.employeeId ?? null,
      query.status ?? null,
      query.page ?? null,
      query.pageSize ?? null,
    ],
  });
}

export type AdminKeyAction = "disable" | "enable";

/** 409 冲突文案：CAS 未命中说明状态已被其他管理员改动，引导刷新而不是重试。 */
function adminKeyActionErrorMessage(
  error: unknown,
  action: AdminKeyAction,
): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "MODEL_KEY_STATE_CONFLICT") {
    return "该 Key 状态已被其他操作改变，请刷新列表后重试";
  }
  if (error.code === "MODEL_ADMIN_TARGET_NOT_FOUND") {
    return "目标 Key 不存在或已不可管理";
  }
  return action === "disable" ? "代禁用失败，请稍后重试" : "代启用失败，请稍后重试";
}

/**
 * 管理面代禁用/代启用：成功后同时失效 Key 列表与平台用量缓存
 * （禁用会改变后续调用成败，用量汇总必须跟着刷新）。
 */
export function useAdminKeyStatusChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { keyId: string; action: AdminKeyAction }) =>
      input.action === "disable"
        ? disableAdminKey(input.keyId)
        : enableAdminKey(input.keyId),
    onError: (error, input) => {
      const message = adminKeyActionErrorMessage(error, input.action);
      // 冲突/不存在是明确的业务语义，用 warning 直达原因；其余按通用失败处理
      if (
        error instanceof ApiError &&
        (error.code === "MODEL_KEY_STATE_CONFLICT" ||
          error.code === "MODEL_ADMIN_TARGET_NOT_FOUND")
      ) {
        showWarningMessage(message ?? "操作失败");
        return;
      }
      showErrorMessage(error, message ?? "操作失败，请稍后重试");
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ["model-service"] });
      showSuccessMessage(
        input.action === "disable" ? "已代员工禁用该 Key" : "已代员工启用该 Key",
      );
    },
  });
}
