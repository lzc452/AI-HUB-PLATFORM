/**
 * AI 助手页面的本地展示数据。
 *
 * 当前项目未接入 Dify 等对话后端，这里集中维护示例问题、能力说明与
 * 推荐应用卡片的静态数据，供页面在无后端时呈现与设计稿一致的对话效果。
 * 接入真实后端后，应将这些数据替换为接口返回。
 */

export interface RecommendedApp {
  applicationId: string;
  badge?: string;
  iconBackground: string;
  iconColor: string;
  iconText: string;
  name: string;
  rating: number;
  ratingCount: number;
  summary: string;
  tags: readonly string[];
  usage: string;
}

export interface AssistantCapability {
  description: string;
  icon: "search" | "like" | "send" | "bulb";
  title: string;
  tips?: readonly string[];
}

export const exampleQuestions: readonly string[] = [
  "有什么适合数据分析的应用？",
  "推荐财务报销相关应用",
  "帮我查找支持 OCR 的应用",
];

export const assistantCapabilities: readonly AssistantCapability[] = [
  {
    description: "输入关键词，快速检索全平台已发布应用。",
    icon: "search",
    title: "搜索应用",
  },
  {
    description: "根据使用场景，智能匹配并推荐最合适的应用。",
    icon: "like",
    title: "推荐场景",
  },
  {
    description: "用一句话描述需求，直接定位目标应用与入口。",
    icon: "send",
    title: "快速导航",
  },
  {
    description: "掌握提问技巧，获得更精准的推荐结果。",
    icon: "bulb",
    title: "使用提示",
    tips: [
      "尽量描述具体场景，例如「财务月报自动化」。",
      "可指定所需能力，例如「需要 OCR 识别」。",
      "结果卡片可点击查看应用详情与交付方式。",
    ],
  },
];

export const recommendedApps: readonly RecommendedApp[] = [
  {
    applicationId: "app-dataviz",
    badge: "推荐",
    iconBackground: "#0060f0",
    iconColor: "#ffffff",
    iconText: "数",
    name: "数据可视化平台",
    rating: 4.8,
    ratingCount: 236,
    summary: "拖拽式仪表盘搭建，支持多数据源接入与实时大屏展示。",
    tags: ["数据分析", "可视化", "仪表盘", "BI"],
    usage: "12.5k",
  },
  {
    applicationId: "app-reportgen",
    badge: "高匹配",
    iconBackground: "#4ac78c",
    iconColor: "#ffffff",
    iconText: "报",
    name: "报表自动生成",
    rating: 4.7,
    ratingCount: 189,
    summary: "按模板定时生成业务报表，支持 Excel 导出与邮件送达。",
    tags: ["报表", "自动化", "定时调度", "Excel导出"],
    usage: "8.2k",
  },
];

export const assistantGreeting = {
  followUp:
    "如果需要更详细的对比，或想根据具体业务场景进一步筛选，告诉我你的需求即可。",
  leadIn: "根据你的需求，我为你推荐了以下应用：",
  subtitle: "我可以帮助您搜索和推荐合适的应用",
  title: "你好，我是 AI 助手",
};
