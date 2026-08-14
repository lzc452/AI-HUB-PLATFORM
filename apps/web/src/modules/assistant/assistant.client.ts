/** AI 助手 API 客户端与纯说明文案。推荐应用由 Catalog API 返回。 */

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

import { apiFetch } from "../../shared/api/client";

export interface AssistantResponse {
  status: "ok" | "degraded";
  answer: string;
}

export function askAssistant(input: {
  question: string;
  context: Readonly<Record<string, unknown>>;
}): Promise<AssistantResponse> {
  return apiFetch<AssistantResponse>("/internal/analytics/assistant", {
    body: JSON.stringify(input),
    method: "POST",
  });
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

export const assistantGreeting = {
  followUp:
    "如果需要更详细的对比，或想根据具体业务场景进一步筛选，告诉我你的需求即可。",
  leadIn: "根据你的需求，我为你推荐了以下应用：",
  subtitle: "我可以帮助您搜索和推荐合适的应用",
  title: "你好，我是 AI 助手",
};
