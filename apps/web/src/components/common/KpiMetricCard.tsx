import { CaretDownOutlined, CaretUpOutlined, MinusOutlined } from "@ant-design/icons";
import { Typography } from "antd";

const { Text, Title } = Typography;

export interface KpiMetricCardProps {
  icon: React.ReactNode;
  iconBackground?: string;
  iconColor?: string;
  index?: number;
  label: string;
  trend?: {
    direction: "up" | "down" | "flat";
    label?: string;
    value: number;
  };
  value: React.ReactNode;
}

const directionMeta = {
  down: { color: "#f5222d", icon: CaretDownOutlined, tint: "#fff1f0" },
  flat: { color: "#8c8c8c", icon: MinusOutlined, tint: "#fafafa" },
  up: { color: "#52c41a", icon: CaretUpOutlined, tint: "#f6ffed" },
};

/** 指标卡片：左侧图标 + 标签/数值/较上周期变化。 */
export function KpiMetricCard({
  icon,
  iconBackground = "#e6f4ff",
  iconColor = "#1677ff",
  index,
  label,
  trend,
  value,
}: KpiMetricCardProps) {
  const trendMeta = trend ? directionMeta[trend.direction] : null;
  const TrendIcon = trendMeta?.icon;

  return (
    <article
      className="dashboard-panel dash-rise rounded-xl bg-white p-3"
      style={index !== undefined ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ backgroundColor: iconBackground, color: iconColor }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <Text className="block text-xs text-[#8c8c8c]">{label}</Text>
          <Title className="!m-0 !text-2xl leading-none" level={3}>
            {value}
          </Title>
          {trend && TrendIcon ? (
            <span
              className="mt-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none"
              style={{ backgroundColor: trendMeta.tint, color: trendMeta.color }}
            >
              <TrendIcon aria-hidden="true" className="text-[10px]" />
              {trend.direction === "up" ? "+" : ""}
              {trend.value}%
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
