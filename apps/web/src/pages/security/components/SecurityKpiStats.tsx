import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";

import type { AuditLogRow } from "../../../modules/security";

import { getSecurityKpiStats } from "./constants";

/**
 * KPI 指标行：4 张指标卡（48×48 rounded-xl 浅色方形图标容器 + 24px 图标 +
 * 数值 26px/700 + 趋势行）。hover 轻微上浮阴影，150-200ms 平滑过渡。
 */
export function SecurityKpiStats({ rows }: { rows: readonly AuditLogRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-[16px] lg:grid-cols-4">
      {getSecurityKpiStats(rows).map(
        ({
          Icon,
          iconBgClass,
          iconColorClass,
          key,
          label,
          trendArrow,
          trendClass,
          trendText,
          value,
        }) => {
          const TrendArrow =
            trendArrow === "up" ? ArrowUpOutlined : ArrowDownOutlined;
          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-xl border border-solid border-[#d9d9d9] bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)]"
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBgClass}`}
              >
                <Icon className={`text-[24px] ${iconColorClass}`} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] leading-[1.4] text-[#595959]">
                  {label}
                </div>
                <div className="text-[26px] font-[700] leading-[1.2] text-[#1f1f1f]">
                  {value}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[12px]">
                  <span className="text-[#8c8c8c]">较昨日</span>
                  <TrendArrow className={`text-[12px] ${trendClass}`} />
                  <span className={trendClass}>{trendText}</span>
                </div>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}
