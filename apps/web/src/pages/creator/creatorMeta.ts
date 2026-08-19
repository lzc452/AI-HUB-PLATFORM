// 应用状态中文映射已提取为共享模块（详情/审核/创作者中心共用）。
export {
  applicationStatusFallback,
  applicationStatusMeta,
  statusMeta,
} from "../../modules/application/application-status";

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
