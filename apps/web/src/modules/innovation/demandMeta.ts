import type { DemandStatus } from "@ai-hub/contracts";

export const demandStatusText: Record<DemandStatus, string> = {
  closed: "已关闭",
  completed: "已完成",
  draft: "草稿",
  in_progress: "进行中",
  merged: "已合并",
  pending_review: "待审核",
  pilot: "试点中",
  published: "已发布",
  rejected: "已驳回",
};

export const demandStatusColor: Record<DemandStatus, string> = {
  closed: "default",
  completed: "success",
  draft: "default",
  in_progress: "processing",
  merged: "default",
  pending_review: "warning",
  pilot: "blue",
  published: "blue",
  rejected: "error",
};

export const demandAudienceText: Record<
  "all" | "department" | "employee",
  string
> = {
  all: "全员可见",
  department: "部门可见",
  employee: "指定员工",
};
