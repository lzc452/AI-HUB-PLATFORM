import {
  ApartmentOutlined,
  CheckCircleFilled,
  RiseOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { KpiCard } from "../../../../components/common/KpiCard";
import { formatNumber } from "./constants";

interface DepartmentStatsProps {
  active: number;
  memberTotal: number;
  syncRate: string;
  total: number;
}

const trendClass = "text-xs text-[#52c41a]";

/** 部门管理页 KPI 卡：数据由容器计算后整体传入，使用 KpiCard 组件。 */
export function DepartmentStats({
  active,
  memberTotal,
  syncRate,
  total,
}: DepartmentStatsProps) {
  return (
    <section
      aria-label="部门统计"
      className="grid grid-cols-2 gap-2 md:grid-cols-4"
    >
      <KpiCard
        icon={<ApartmentOutlined className="text-lg text-[#722ed1]" />}
        label="总部门"
        trend={<span className={trendClass}>较上月 +2</span>}
        value={formatNumber(total)}
      />
      <KpiCard
        icon={<CheckCircleFilled className="text-lg text-[#52c41a]" />}
        label="启用部门"
        trend={<span className={trendClass}>较上月 +2</span>}
        value={formatNumber(active)}
      />
      <KpiCard
        icon={<UserOutlined className="text-lg text-[#1677ff]" />}
        label="总成员数"
        trend={<span className={trendClass}>较上月 +36</span>}
        value={formatNumber(memberTotal)}
      />
      <KpiCard
        icon={<RiseOutlined className="text-lg text-[#fa8c16]" />}
        label="最近同步成功率"
        trend={<span className={trendClass}>较上月 +2.1%</span>}
        value={syncRate}
      />
    </section>
  );
}
