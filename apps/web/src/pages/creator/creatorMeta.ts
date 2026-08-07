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

export interface CreatorAchievement {
  /** 徽章渐变色（inline style，复用市场页渐变色板）。 */
  gradient: string;
  title: string;
}

/** 创作者成就徽章（静态展示，参照设计图）。 */
export const creatorAchievements: readonly CreatorAchievement[] = [
  {
    gradient: "linear-gradient(135deg,#3d6bff,#7c9bff)",
    title: "万级使用应用库",
  },
  {
    gradient: "linear-gradient(135deg,#f79009,#ffc53d)",
    title: "五星应用创作者",
  },
  {
    gradient: "linear-gradient(135deg,#eb2f96,#ffadd2)",
    title: "五星应用创作者",
  },
];

/** 发布建议条目（静态展示，参照设计图）。 */
export const publishingSuggestions: readonly string[] = [
  "如何撰写吸引人的应用简介",
  "如何优化 AI 模型参数",
  "如何撰写正确的应用方法",
  "如何编排模型的应用流程",
  "如何优化发布应用推广量",
];

export interface DeveloperResource {
  icon: "api" | "experiment" | "comment" | "read";
  title: string;
}

/** 开发者资源入口（静态展示，参照设计图）。 */
export const developerResources: readonly DeveloperResource[] = [
  { icon: "api", title: "API 文档" },
  { icon: "experiment", title: "模型市场" },
  { icon: "comment", title: "开发者论坛" },
  { icon: "read", title: "开发者文档" },
];

export type CreatorSortMode = "latest" | "rating" | "popular";

/** 应用管理表格排序选项。 */
export const creatorSortOptions: readonly {
  label: string;
  value: CreatorSortMode;
}[] = [
  { label: "最新发布", value: "latest" },
  { label: "评分最高", value: "rating" },
  { label: "人气最高", value: "popular" },
];
