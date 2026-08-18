import { ApiError } from "../../shared/api/client";

const APPLICATION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  APPLICATION_NOT_EDITABLE: "当前应用状态不允许编辑",
  APPLICATION_OWNER_REQUIRED: "仅应用负责人可以执行此操作",
  ARTIFACT_NOT_VERIFIED: "版本制品尚未通过安全校验",
  ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE:
    "桌面端/移动端应用需先上传安装包（绑定制品）后才能提交审核",
  DELIVERY_CHANNELS_INCOMPLETE: "发布前必须启用全部四个交付渠道",
  DRAFT_VALIDATION_FAILED: "草稿未通过提交校验",
  INVALID_APPLICATION_TRANSITION: "当前应用状态不允许执行此操作",
  UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION:
    "制品未签名，请勾选确认接受风险后再操作",
  UPLOAD_ALREADY_COMPLETED: "该上传会话已经结束，请重新选择文件",
  UPLOAD_CONTENT_MISSING: "上传内容缺失，请重新上传文件",
  UPLOAD_EXPIRED: "上传会话已过期，请重新上传文件",
  VERSION_ALREADY_EXISTS: "该版本号已存在，请使用新的版本号",
};

const ARTIFACT_UPLOAD_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  MALWARE_DETECTED: "检测到恶意文件，请更换制品后重试",
  MIME_TYPE_MISMATCH: "文件类型与声明不一致，请更换制品后重试",
  SIGNATURE_INVALID: "制品签名无效，请重新签名后上传",
  UPLOAD_FAILED: "制品上传或校验失败，请重试",
};

/** 将 application 领域错误转换为可操作的用户提示，并保留未知错误。 */
export function toApplicationErrorMessage(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  const message = APPLICATION_ERROR_MESSAGES[error.code];
  if (message === undefined) return error;
  const trace = error.traceId ? `（追踪 ID：${error.traceId}）` : "";
  return `${message}${trace}`;
}

export function getArtifactUploadErrorMessage(code: string | null): string {
  if (code === null) return "制品扫描或上传未完成，请重试";
  return ARTIFACT_UPLOAD_ERROR_MESSAGES[code] ?? `制品校验失败（${code}）`;
}

/** 将「提交审核」失败错误格式化为用户提示（DRAFT_VALIDATION_FAILED 附校验问题清单）。 */
export function formatSubmitError(error: unknown): string {
  if (error instanceof ApiError && error.code === "DRAFT_VALIDATION_FAILED") {
    const issues = error.issues ?? [];
    const trace = error.traceId ? `（追踪 ID：${error.traceId}）` : "";
    const header =
      APPLICATION_ERROR_MESSAGES.DRAFT_VALIDATION_FAILED ??
      "草稿未通过提交校验";
    if (issues.length === 0) return `${header}${trace}`;
    const lines = issues
      .map((issue) => `- ${issue.message ?? issue.code ?? "未知校验问题"}`)
      .join("\n");
    return `${header}${trace}：\n${lines}`;
  }
  const mapped = toApplicationErrorMessage(error);
  if (typeof mapped === "string") return mapped;
  if (mapped instanceof Error) return `提交失败：${mapped.message}`;
  return "提交失败，请重试";
}
