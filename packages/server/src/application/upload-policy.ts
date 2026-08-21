import type { UploadKind } from "@ai-hub/contracts";

/** 资产类 kind（complete 后自动创建 asset）。 */
export type AssetKind = Exclude<UploadKind, "artifact">;

export interface UploadKindPolicy {
  kind: UploadKind;
  maxSizeBytes: number;
  allowedExtensions: readonly string[];
  allowedMimeTypes: readonly string[];
  svgAllowed: boolean;
  createsAsset: boolean;
  assetType?: AssetKind;
}

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
const IMAGE_SVG_MIME = [...IMAGE_MIME, "image/svg+xml"] as const;

/** 各 kind 的统一校验策略（大小 / 扩展名 / MIME / SVG）。 */
export const UPLOAD_KIND_POLICIES: Readonly<
  Record<UploadKind, UploadKindPolicy>
> = {
  icon: {
    kind: "icon",
    maxSizeBytes: 5 * MB,
    allowedExtensions: ["png", "jpg", "jpeg", "webp", "svg"],
    allowedMimeTypes: IMAGE_SVG_MIME,
    svgAllowed: true,
    createsAsset: true,
    assetType: "icon",
  },
  screenshot: {
    kind: "screenshot",
    maxSizeBytes: 10 * MB,
    allowedExtensions: ["png", "jpg", "jpeg", "webp"],
    allowedMimeTypes: IMAGE_MIME,
    svgAllowed: false,
    createsAsset: true,
    assetType: "screenshot",
  },
  cover: {
    kind: "cover",
    maxSizeBytes: 5 * MB,
    allowedExtensions: ["png", "jpg", "jpeg", "webp"],
    allowedMimeTypes: IMAGE_MIME,
    svgAllowed: false,
    createsAsset: true,
    assetType: "cover",
  },
  attachment: {
    kind: "attachment",
    maxSizeBytes: 50 * MB,
    allowedExtensions: [
      "pdf",
      "zip",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "md",
      "csv",
    ],
    allowedMimeTypes: [],
    svgAllowed: false,
    createsAsset: true,
    assetType: "attachment",
  },
  qr: {
    kind: "qr",
    maxSizeBytes: 5 * MB,
    allowedExtensions: ["png", "svg"],
    allowedMimeTypes: IMAGE_SVG_MIME,
    svgAllowed: true,
    createsAsset: true,
    assetType: "qr",
  },
  artifact: {
    kind: "artifact",
    maxSizeBytes: 2 * GB,
    allowedExtensions: ["exe", "msi", "dmg", "pkg", "apk", "zip", "tar", "gz"],
    allowedMimeTypes: [],
    svgAllowed: false,
    // 版本制品的异步流水线（outbox → worker 校验），complete 不创建资产行。
    createsAsset: false,
  },
  installer: {
    kind: "installer",
    maxSizeBytes: 2 * GB,
    allowedExtensions: ["exe", "msi", "dmg", "pkg", "apk", "zip", "tar", "gz"],
    allowedMimeTypes: [],
    svgAllowed: false,
    // 创建应用向导上传安装包（同步 complete 创建资产行，资产类型 artifact），
    // 提交时由 persistDraftDeliveries 关联到交付渠道供目录下载。
    createsAsset: true,
    assetType: "artifact",
  },
};

/** 从文件名取小写扩展名（不含点）。 */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/** 校验 kind / 文件名 / MIME / 大小是否符合策略。 */
export function assertUploadAllowed(input: {
  kind: UploadKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): void {
  const policy = UPLOAD_KIND_POLICIES[input.kind];
  if (policy === undefined) throw new Error("UPLOAD_KIND_INVALID");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("UPLOAD_SIZE_INVALID");
  }
  if (input.sizeBytes > policy.maxSizeBytes) {
    throw new Error("UPLOAD_SIZE_TOO_LARGE");
  }
  const ext = fileExtension(input.fileName);
  if (!policy.allowedExtensions.includes(ext)) {
    throw new Error("UPLOAD_EXTENSION_NOT_ALLOWED");
  }
  if (
    policy.allowedMimeTypes.length > 0 &&
    !policy.allowedMimeTypes.includes(input.mimeType)
  ) {
    throw new Error("UPLOAD_MIME_NOT_ALLOWED");
  }
}

/** 校验文件头（魔数）与扩展名一致；无法识别的扩展名默认放行（由扫描兜底）。 */
export function assertMagicMatches(
  content: Uint8Array,
  extension: string,
): void {
  const bytes = (values: readonly number[], offset = 0): boolean =>
    values.every((value, index) => content[offset + index] === value);
  const ascii = (offset: number, length: number): string =>
    Buffer.from(content.subarray(offset, offset + length)).toString("latin1");

  let ok = true;
  switch (extension) {
    case "png":
      ok = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      break;
    case "jpg":
    case "jpeg":
      ok = bytes([0xff, 0xd8, 0xff]);
      break;
    case "webp":
      ok = bytes([0x52, 0x49, 0x46, 0x46]) && ascii(8, 4) === "WEBP";
      break;
    case "pdf":
      ok = ascii(0, 4) === "%PDF";
      break;
    case "zip":
    case "docx":
    case "xlsx":
    case "pptx":
    case "apk":
      ok = bytes([0x50, 0x4b]);
      break;
    case "exe":
    case "msi":
    case "dll":
      ok = bytes([0x4d, 0x5a]);
      break;
    default:
      // 文本 / 旧版 Office 等不做魔数校验，交给扫描适配器。
      ok = true;
  }
  if (!ok) throw new Error("UPLOAD_MAGIC_MISMATCH");
}
