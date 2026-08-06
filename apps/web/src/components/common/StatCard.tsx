import { Typography } from "antd";

const { Text, Title } = Typography;

export interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

/** 统计卡片：图标 + 数值 + 标题。 */
export function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-5">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <Text type="secondary">{label}</Text>
      </div>
      <Title level={2} className="!mb-0">
        {value}
      </Title>
    </div>
  );
}
