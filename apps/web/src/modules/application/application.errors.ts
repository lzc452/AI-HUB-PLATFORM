import { ApiError } from "../../shared/api/client";

const APPLICATION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  APPLICATION_NOT_EDITABLE: "当前应用状态不允许编辑",
  APPLICATION_OWNER_REQUIRED: "仅应用负责人可以执行此操作",
  ARTIFACT_NOT_VERIFIED: "版本制品尚未通过安全校验",
  DELIVERY_CHANNELS_INCOMPLETE: "发布前必须启用全部四个交付渠道",
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
