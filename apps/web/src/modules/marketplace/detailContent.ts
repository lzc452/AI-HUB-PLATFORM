import type { CatalogEntry, DeliveryChannel } from "@ai-hub/contracts";

import { channelText } from "./catalogMeta";

/**
 * 应用详情页占位文案与衍生内容工具。
 *
 * 设计文档 §6 期望丰富的详情内容（业务场景 / 解决问题 / 关键特点 / 维护人 /
 * 附件 / 风险说明等），但 CatalogEntry 字段有限；本模块在不改动数据契约的前提下
 * 复用现有字段（summary / tagIds / trustLabels / deliveryChannels / categoryId /
 * departmentId / applicationId）衍生展示文案。
 */

const MOCK_MAINTAINERS = ["李小龙", "王芳", "刘涛", "张敏", "陈静"] as const;

export interface AttachmentMeta {
  /** 文件名 */
  name: string;
  /** 文件类型标签（PDF / DOCX / DOC） */
  type: "pdf" | "docx" | "doc";
  /** 文件大小（人类可读） */
  size: string;
}

export interface KeyPoint {
  id: string;
  text: string;
}

const MOCK_ATTACHMENTS: ReadonlyArray<AttachmentMeta> = [
  { name: "使用手册", type: "pdf", size: "2.4 MB" },
  { name: "集成文档", type: "docx", size: "1.1 MB" },
  { name: "变更记录", type: "pdf", size: "320 KB" },
  { name: "部署指南", type: "doc", size: "180 KB" },
];

/** 基于 applicationId 计算稳定的非负整数哈希值。 */
function hashByApplicationId(applicationId: string): number {
  let hash = 0;
  for (let index = 0; index < applicationId.length; index += 1) {
    hash = (hash * 31 + applicationId.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** 根据应用 id 在固定池中取维护人列表（2-3 人）。 */
export function deriveMaintainers(applicationId: string): string[] {
  const offset = hashByApplicationId(applicationId) % MOCK_MAINTAINERS.length;
  const count = 2 + (hashByApplicationId(`${applicationId}:m`) % 2);
  return Array.from(
    { length: count },
    (_, index) =>
      MOCK_MAINTAINERS[(offset + index) % MOCK_MAINTAINERS.length] ??
      MOCK_MAINTAINERS[0]!,
  );
}

/** 根据应用 id 在固定池中取责任人（1 人）。 */
export function deriveOwner(applicationId: string): string {
  const offset = hashByApplicationId(`${applicationId}:o`) % MOCK_MAINTAINERS.length;
  return MOCK_MAINTAINERS[offset] ?? MOCK_MAINTAINERS[0]!;
}

/** 估算评分人数。CatalogEntry 没有 ratingCount 字段，使用 likeCount 作下界代理。 */
export function deriveRatingCount(likeCount: number): number {
  return Math.max(likeCount, 0);
}

/** 业务场景：直接复用应用 summary。 */
export function buildBusinessScenario(entry: CatalogEntry): string {
  return entry.summary.trim();
}

/** 解决问题：基于 summary + tagIds 拼接一句话。 */
export function buildProblemStatement(entry: CatalogEntry): string {
  const tagPart =
    entry.tagIds.length > 0 ? entry.tagIds.slice(0, 3).join("、") : "核心业务";
  const subject = entry.summary.trim() || "当前业务";
  return `${subject} 中提到的关键挑战，结合 ${tagPart} 等领域知识自动生成差异化方案，识别准确率优于通用模板。`;
}

/** 关键特点：3 条衍生文案。 */
export function buildKeyPoints(entry: CatalogEntry): KeyPoint[] {
  const firstTag = entry.tagIds[0] ?? entry.categoryId ?? "业务";
  const firstChannel: DeliveryChannel = entry.deliveryChannels[0] ?? "web";
  const departmentHint = entry.departmentId ? entry.departmentId : "业务部门";
  const verified = entry.trustLabels.includes("verified");

  return [
    {
      id: "kp-1",
      text: `自动化识别 ${firstTag} 类型输入，准确率高于行业基线 ${verified ? "（已通过企业级审核）" : ""}`,
    },
    {
      id: "kp-2",
      text: `依托 ${departmentHint} 团队维护，问题响应窗口 ≤ 1 个工作日`,
    },
    {
      id: "kp-3",
      text: `支持 ${channelText[firstChannel]} 交付，与现有 OA/财务流程无缝集成`,
    },
  ];
}

/** 固定 4 条附件列表。 */
export function listAttachments(): ReadonlyArray<AttachmentMeta> {
  return MOCK_ATTACHMENTS;
}

/** 评分人数显示文案。 */
export function buildRatingCountLabel(likeCount: number): string {
  const count = deriveRatingCount(likeCount);
  return count > 0 ? `（${count}）` : "";
}