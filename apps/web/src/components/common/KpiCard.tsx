import { Typography } from "antd";

const { Text, Title } = Typography;

export interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  trend?: React.ReactNode;
  value: React.ReactNode;
}

/** 指标卡片：图标 + 数值 + 标题 + 可选趋势。 */
export function KpiCard({ icon, label, trend, value }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <Text type="secondary">{label}</Text>
      </div>
      <Title level={2} className="!mb-0">
        {value}
      </Title>
      {trend ? (
        <div className="mt-2 text-xs text-[#595959]">{trend}</div>
      ) : null}
    </div>
  );
}
