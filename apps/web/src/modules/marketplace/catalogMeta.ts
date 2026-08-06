import type { DeliveryChannel, TrustLabel } from "@ai-hub/contracts";

export const channelText: Record<DeliveryChannel, string> = {
  desktop: "桌面端",
  mini_program: "小程序",
  mobile: "移动端",
  web: "Web应用",
};

export const trustLabelMeta: Record<
  TrustLabel,
  { color: string; text: string }
> = {
  deprecated: { color: "orange", text: "即将废弃" },
  experimental: { color: "default", text: "实验性" },
  recommended: { color: "pink", text: "推荐" },
  verified: { color: "green", text: "已审核" },
};

export function formatCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`;
}

export function relativeUpdateText(isoDate: string): string {
  const elapsed = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) {
    return "刚刚更新";
  }
  if (hours < 24) {
    return `${hours}小时前更新`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}天前更新`;
  }
  return new Date(isoDate).toLocaleDateString("zh-CN");
}

const iconGradients = [
  "linear-gradient(135deg,#3d6bff,#7c9bff)",
  "linear-gradient(135deg,#12b76a,#5eead4)",
  "linear-gradient(135deg,#7a5af8,#b79cff)",
  "linear-gradient(135deg,#f79009,#ffc53d)",
  "linear-gradient(135deg,#06aed4,#67e8f9)",
  "linear-gradient(135deg,#eb2f96,#ffadd2)",
] as const;

export function iconGradient(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % iconGradients.length;
  }
  return iconGradients[hash] ?? iconGradients[0] ?? "";
}
