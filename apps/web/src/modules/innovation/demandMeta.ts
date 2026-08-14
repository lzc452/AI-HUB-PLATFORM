import type { DemandStatus } from "@ai-hub/contracts";

export const demandStatusText: Record<DemandStatus, string> = {
  closed: "已关闭",
  converted: "已转化为应用",
  draft: "草稿",
  claimed: "已认领",
  validating: "方案验证中",
  merged: "已合并",
  pending_review: "待审核",
  pending_claim: "待认领",
  pilot: "试点中",
  rejected: "已驳回",
};

export const demandStatusColor: Record<DemandStatus, string> = {
  closed: "default",
  converted: "success",
  draft: "default",
  claimed: "processing",
  validating: "cyan",
  merged: "default",
  pending_review: "warning",
  pending_claim: "blue",
  pilot: "geekblue",
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
