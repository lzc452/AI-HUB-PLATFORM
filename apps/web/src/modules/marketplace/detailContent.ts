import type { CatalogEntry, DeliveryChannel } from "@ai-hub/contracts";

import { channelText } from "./catalogMeta";

export interface AttachmentMeta {
  name: string;
  type: "pdf" | "docx" | "doc" | "other";
  size: string;
}

export interface KeyPoint {
  id: string;
  text: string;
}

export function deriveMaintainers(entry: CatalogEntry): string[] {
  return [...(entry.maintainers ?? [])];
}

export function deriveOwner(entry: CatalogEntry): string {
  return entry.maintainers?.[0] ?? "—";
}

export function deriveRatingCount(entry: CatalogEntry): number {
  return entry.ratingCount ?? 0;
}

export function buildBusinessScenario(entry: CatalogEntry): string {
  return entry.summary.trim();
}

export function buildProblemStatement(entry: CatalogEntry): string {
  const tagPart =
    entry.tagIds.length > 0 ? entry.tagIds.slice(0, 3).join("、") : "核心业务";
  const subject = entry.summary.trim() || "当前业务";
  return `${subject}中的关键挑战，结合 ${tagPart} 等领域知识形成差异化方案。`;
}

export function buildKeyPoints(entry: CatalogEntry): KeyPoint[] {
  const firstTag = entry.tagIds[0] ?? entry.categoryId ?? "业务";
  const firstChannel: DeliveryChannel = entry.deliveryChannels[0] ?? "web";
  const departmentHint = entry.departmentId || "业务部门";
  const verified = entry.trustLabels.includes("verified");
  return [
    {
      id: "kp-1",
      text: `自动化识别 ${firstTag} 类型输入并返回结构化结果${verified ? "（已通过企业级审核）" : ""}`,
    },
    {
      id: "kp-2",
      text: `由 ${departmentHint} 团队维护，支持问题反馈和版本追踪。`,
    },
    {
      id: "kp-3",
      text: `支持 ${channelText[firstChannel]} 交付，使用前会校验当前用户的可见性和能力。`,
    },
  ];
}

export function listAttachments(
  entry: CatalogEntry,
): ReadonlyArray<AttachmentMeta> {
  return entry.attachments ?? [];
}

export function buildRatingCountLabel(entry: CatalogEntry): string {
  const count = deriveRatingCount(entry);
  return count > 0 ? `（${count} 人评分）` : "";
}
