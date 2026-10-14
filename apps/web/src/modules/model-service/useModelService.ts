import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "../../shared/api/client";
import {
  showErrorMessage,
  showSuccessMessage,
  showWarningMessage,
} from "../../shared/ui/message";
// feature 之间走 barrel：深路径导入被 dependency-cruiser 规则禁止
// （no-deep-imports-into-web-feature-auth）
import { useAuth } from "../auth";
import {
  createApiKey,
  disableAdminKey,
  disableApiKey,
  enableAdminKey,
  enableApiKey,
  getMyKey,
  getMyUsage,
  getPlatformUsage,
  listAdminKeys,
  listMyCalls,
  listMyKeys,
  revokeApiKey,
  rotateApiKey,
  updateApiKey,
  type AdminKeyListQuery,
  type AdminUsageQuery,
  type CallListQuery,
  type CreateApiKeyInput,
  type MyKeyListQuery,
  type UpdateApiKeyInput,
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
  return action === "disable"
    ? "代禁用失败，请稍后重试"
    : "代启用失败，请稍后重试";
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
        input.action === "disable"
          ? "已代员工禁用该 Key"
          : "已代员工启用该 Key",
      );
    },
  });
}

// ---------------------------------------------------------------------------
// 本人 Key 生命周期（PRD 8.1）
// ---------------------------------------------------------------------------

/** 本人 Key 列表（不含明文；默认不含已撤销）。 */
export function useMyKeys(query: MyKeyListQuery, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    enabled,
    queryFn: () => listMyKeys(query),
    queryKey: [
      "model-service",
      "my-keys",
      session?.employeeId ?? null,
      query.includeRevoked ?? null,
      query.page ?? null,
      query.pageSize ?? null,
    ],
  });
}

export function useApiKey(keyId: string | undefined, enabled = true) {
  return useQuery({
    enabled: enabled && keyId !== undefined,
    queryFn: () => getMyKey(keyId as string),
    queryKey: ["model-service", "my-key", keyId ?? null],
  });
}

/** 领域错误码 → 人话（控制面错误码表，PRD 8.1）。 */
const KEY_ERROR_MESSAGES: Record<string, string> = {
  MODEL_KEY_NOT_FOUND: "Key 不存在或无权访问",
  MODEL_KEY_STATE_CONFLICT: "Key 状态已变化，请刷新后重试",
  MODEL_KEY_NAME_DUPLICATED: "同名 Key 已存在（未撤销的 Key 名称唯一）",
  MODEL_KEY_LIMIT_REACHED: "已达到每人 Key 数量上限",
  MODEL_KEY_INVALID_LIMIT: "限额超出允许范围",
  MODEL_SERVICE_NOT_CONFIGURED: "服务端未配置摘要密钥，暂无法创建 Key",
};

/**
 * Key 生命周期 mutations 的统一错误出口：
 * 领域错误码命中映射表时用 warning 直达原因（这些是用户可自助消化的语义），
 * 其余（网络/5xx）走通用错误提示。
 */
function reportKeyMutationError(error: unknown, fallback: string): void {
  if (error instanceof ApiError) {
    const mapped = KEY_ERROR_MESSAGES[error.code];
    if (mapped !== undefined) {
      showWarningMessage(mapped);
      return;
    }
  }
  showErrorMessage(error, fallback);
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ["model-service"] });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => createApiKey(input),
    onError: (error) => reportKeyMutationError(error, "创建 Key 失败"),
    onSuccess: () => {
      invalidateAll(queryClient);
      showSuccessMessage("Key 已创建，请立即保存明文");
    },
  });
}

export function useUpdateApiKey(keyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateApiKeyInput) =>
      updateApiKey(keyId as string, input),
    onError: (error) => reportKeyMutationError(error, "保存失败"),
    onSuccess: () => {
      invalidateAll(queryClient);
      showSuccessMessage("Key 属性已更新");
    },
  });
}

/** 本人视角禁用/启用（与管理面代操作分开：提示语与审计主体不同）。 */
export function useApiKeyStatusChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { keyId: string; action: AdminKeyAction }) =>
      input.action === "disable"
        ? disableApiKey(input.keyId)
        : enableApiKey(input.keyId),
    onError: (error) => reportKeyMutationError(error, "状态变更失败"),
    onSuccess: (_result, input) => {
      invalidateAll(queryClient);
      showSuccessMessage(
        input.action === "disable" ? "Key 已禁用" : "Key 已启用",
      );
    },
  });
}

/**
 * 轮换：旧 Key 同事务撤销、无宽限期，返回新 Key 明文。
 * 成功提示不在这里做——调用方需要先弹一次性明文展示框，提示由展示框负责。
 */
export function useRotateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => rotateApiKey(keyId),
    onError: (error) => reportKeyMutationError(error, "轮换失败"),
    onSuccess: () => {
      invalidateAll(queryClient);
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => revokeApiKey(keyId),
    onError: (error) => reportKeyMutationError(error, "删除失败"),
    onSuccess: () => {
      invalidateAll(queryClient);
      showSuccessMessage("Key 已删除（撤销）");
    },
  });
}
