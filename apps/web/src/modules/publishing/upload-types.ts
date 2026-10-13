import type { UploadKind } from "@ai-hub/contracts";

/**
 * 向导上传回调：由页面注入（先确保草稿创建再上传，避免 applicationId 为空时 404）。
 *
 * 单独成文件是为了让steps.tsx 与 asset-fields.tsx 都能引用，
 * 而不产生彼此的模块依赖（原定义内联在 steps.tsx 里）。
 */
export type WizardUploadFn = (
  kind: UploadKind,
  file: File,
) => Promise<{ assetId: string }>;
