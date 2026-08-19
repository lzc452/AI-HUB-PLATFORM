import type { ApplicationStatus } from "@ai-hub/contracts";

/** 应用状态 → 中文文案与 Tag 颜色映射；未列出的状态走兜底。 */
export const applicationStatusMeta: Record<
  ApplicationStatus,
  { color: string; text: string }
> = {
  approved: { color: "blue", text: "已通过" },
  archived: { color: "default", text: "已归档" },
  draft: { color: "default", text: "草稿" },
  in_review: { color: "orange", text: "审核中" },
  published: { color: "green", text: "已发布" },
  withdrawn: { color: "gold", text: "已下架" },
};

/** 状态兜底（防御后端返回未知状态）。 */
export const applicationStatusFallback = {
  color: "default",
  text: "未知状态",
} as const;

export function statusMeta(status: string): {
  color: string;
  text: string;
} {
  return (
    applicationStatusMeta[status as ApplicationStatus] ??
    applicationStatusFallback
  );
}
