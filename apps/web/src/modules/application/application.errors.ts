import { ApiError } from "../../shared/api/client";

const APPLICATION_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  APPLICATION_ACCESS_FORBIDDEN: "您无权访问该应用",
  APPLICATION_DELETE_STATUS_INVALID: "当前状态不允许删除应用",
  APPLICATION_MAINTAINER_REQUIRED: "仅应用负责人或维护人可执行此操作",
  APPLICATION_NOT_EDITABLE: "当前应用状态不允许编辑",
  APPLICATION_OWNER_REQUIRED: "仅应用负责人可以执行此操作",
  APPLICATION_STATE_CONFLICT: "应用状态已变化，请刷新后重试",
  APPLICATION_VERSION_MISMATCH: "版本信息不一致，请刷新后重试",
  ARTIFACT_NOT_VERIFIED: "版本制品尚未通过安全校验",
  ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE:
    "桌面端/移动端应用需先上传安装包（绑定制品）后才能提交审核",
  DELIVERY_CHANNELS_INCOMPLETE: "请按应用类型配置对应交付渠道",
  DELIVERY_TARGETS_INCOMPLETE: "小程序渠道需配置已启用的交付目标（含二维码）",
  DELIVERY_TARGETS_NOT_ALLOWED: "该渠道不支持交付目标配置",
  DELIVERY_TARGET_INVALID: "交付目标信息无效",
  DELIVERY_TARGET_QR_REQUIRED: "小程序交付目标需上传二维码",
  DELIVERY_TARGET_ASSET_NOT_FOUND: "交付目标引用的二维码资产不存在",
  DRAFT_NOT_FOUND: "草稿不存在，请重新创建",
  DRAFT_VALIDATION_FAILED: "草稿未通过提交校验",
  INVALID_APPLICATION_TRANSITION: "当前应用状态不允许执行此操作",
  OWNER_UNCHANGED: "责任人未发生变化",
  QR_VALIDATION_UNAVAILABLE: "二维码校验服务不可用，请稍后重试",
  QR_TARGET_FORMAT_INVALID: "二维码目标格式无效",
  QR_DECODE_FAILED: "二维码无法解析",
  REVIEW_ALREADY_PENDING: "已有版本正在审核中，请等待审核结束",
  REVIEW_COMMENT_REQUIRED: "驳回时必须填写审核原因",
  REVIEW_NOT_PENDING: "没有待审核的版本",
  REVIEW_QUEUE_NOT_AVAILABLE: "该审核任务当前不可领取",
  REVIEW_QUEUE_CLAIM_REQUIRED: "该操作需要先领取审核任务",
  REVIEW_QUEUE_NOT_CLAIMED: "该审核任务尚未被领取",
  REVIEW_TRANSFER_FORBIDDEN: "仅超级管理员可以转交审核任务",
  ROLLBACK_TARGET_IS_CURRENT: "不能回滚到当前版本",
  SELF_REVIEW_FORBIDDEN: "不能审核自己参与的应用",
  UNSIGNED_ARTIFACT_REQUIRES_CONFIRMATION:
    "制品未签名，请勾选确认接受风险后再操作",
  UPLOAD_ALREADY_COMPLETED: "该上传会话已经结束，请重新选择文件",
  UPLOAD_CONTENT_MISSING: "上传内容缺失，请重新上传文件",
  UPLOAD_EXPIRED: "上传会话已过期，请重新上传文件",
  VERSION_ALREADY_EXISTS: "该版本号已存在，请使用新的版本号",
  WEB_DELIVERY_URL_MISSING: "交付地址未配置，请先在编辑器中配置应用地址",
  WEB_URL_INVALID: "交付地址无效",
  WEB_URL_CREDENTIALS_FORBIDDEN: "交付地址禁止携带账号凭据",
  WEB_URL_PROTOCOL_NOT_ALLOWED: "交付地址协议不允许",
  WEB_URL_PORT_NOT_ALLOWED: "交付地址端口不允许",
  WEB_URL_HOST_NOT_ALLOWED: "交付地址域名不在白名单内",
  WEB_URL_DNS_FAILED: "交付地址域名解析失败",
  WEB_URL_CIDR_NOT_ALLOWED: "交付地址解析到的网段不在白名单内",
  WITHDRAW_REASON_REQUIRED: "请填写下架原因",
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
