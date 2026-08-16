import { Typography } from "antd";

const { Text, Title } = Typography;

export interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  trend?: string | number | React.ReactNode;
  value: React.ReactNode;
}

// 定义5个颜色
const colors = ["#f2f0fd", "#e4eefe", "#b3e0ff", "#fff6ec", "#daf8e8"];

/** 指标卡片：图标 + 数值 + 标题 + 可选趋势。 */
export function KpiCard({ icon, label, trend, value }: KpiCardProps) {
  const colorIndex =
    [...label].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    colors.length;
  return (
    <div className="flex gap-3 items-start rounded-xl bg-white p-2 dashboard-panel">
      {/* 背景颜色 随机 colors */}
      <div
        className="mb-2 w-12 h-12 flex items-center gap-2 rounded-full justify-center"
        style={{
          backgroundColor: colors[colorIndex],
        }}
      >
        {icon}
      </div>
      <div>
        <Text type="secondary" className="text-sm">
          {label}
        </Text>
        <Title level={2} className="!my-0">
          {value}
        </Title>
        {trend !== undefined && (
          <div className="mt-2 text-xs">
            {typeof trend === "number" ? (
              trend > 0 ? (
                <span className="text-green-500">较上月 +{trend}</span>
              ) : trend < 0 ? (
                <span className="text-red-500">较上月 {trend}</span>
              ) : (
                <span className="text-gray-500">较上月 {trend}</span>
              )
            ) : (
              <span className="text-gray-500">{trend}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
