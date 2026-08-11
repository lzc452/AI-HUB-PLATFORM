import {
  ApartmentOutlined,
  CheckCircleFilled,
  RiseOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { KpiCard } from "../../../components/common/KpiCard";
import { formatNumber } from "./constants";

interface OrganizationStatsProps {
  active: number;
  departmentCount: number;
  total: number;
}


/** 顶部统计卡网格。数据由容器计算后整体传入，自身不持有数据。 */
export function OrganizationStats({
  active,
  departmentCount,
  total,
}: OrganizationStatsProps) {
  return (
    <section
      aria-label="组织统计"
      className="grid grid-cols-2 gap-2 md:grid-cols-4"
    >
      <KpiCard
        icon={<UserOutlined className="text-lg text-[#1677ff]" />}
        label="总用户"
        trend={36}
        value={formatNumber(total)}
      />
      <KpiCard
        icon={<CheckCircleFilled className="text-lg text-[#52c41a]" />}
        label="启用中"
        trend={28}
        value={formatNumber(active)}
      />
      <KpiCard
        icon={<ApartmentOutlined className="text-lg text-[#722ed1]" />}
        label="部门数量"
        trend={2}
        value={formatNumber(departmentCount)}
      />
      <KpiCard
        icon={<RiseOutlined className="text-lg text-[#fa8c16]" />}
        label="最近同步成功率"
        trend={2.1}
        value="98.6%"
      />
    </section>
  );
}
