import {
  AppstoreFilled,
  SafetyCertificateFilled,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { KpiCard } from "../../../../components/common/KpiCard";
import { formatNumber, type RoleSummary } from "./constants";

interface RoleStatsProps {
  rows: RoleSummary[];
}

/** 角色管理页 KPI 卡：由角色列表派生，使用 KpiCard 组件。 */
export function RoleStats({ rows }: RoleStatsProps) {
  const total = rows.length;
  const systemCount = rows.filter((r) => r.roleType === "system").length;
  const customCount = rows.filter((r) => r.roleType === "custom").length;
  const assignedUsers = rows.reduce((sum, r) => sum + r.memberCount, 0);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <KpiCard
        icon={<TeamOutlined className="text-lg text-[#1677ff]" />}
        label="角色总数"
        trend="较上月 +2"
        value={formatNumber(total)}
      />
      <KpiCard
        icon={<SafetyCertificateFilled className="text-lg text-[#1677ff]" />}
        label="系统角色"
        trend="较上月 +0"
        value={formatNumber(systemCount)}
      />
      <KpiCard
        icon={<AppstoreFilled className="text-lg text-[#fa8c16]" />}
        label="自定义角色"
        trend="较上月 +2"
        value={formatNumber(customCount)}
      />
      <KpiCard
        icon={<UserOutlined className="text-lg text-[#1677ff]" />}
        label="已分配用户"
        trend="较上月 +36"
        value={formatNumber(assignedUsers)}
      />
    </div>
  );
}
