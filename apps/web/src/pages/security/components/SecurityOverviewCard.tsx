import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { Typography } from "antd";

import { OVERVIEW_AS_OF, SECURITY_OVERVIEW_ITEMS } from "./constants";

const { Title } = Typography;

/**
 * 右栏「今日安全概况」卡：3 个 40×40 rounded-lg 图标迷你项，
 * 右上角「数据截至 2025-06-01 10:30」。
 */
export function SecurityOverviewCard() {
  return (
    <section
      aria-label="今日安全概况"
      className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <Title className="!mb-0" level={4}>
          今日安全概况
        </Title>
        <span className="text-[12px] text-[#8c8c8c]">{OVERVIEW_AS_OF}</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-solid divide-[#f0f0f0]">
        {SECURITY_OVERVIEW_ITEMS.map(
          (
            {
              Icon,
              iconBgClass,
              iconColorClass,
              key,
              label,
              trendArrow,
              trendClass,
              trendText,
              unit,
              value,
              valueClass,
            },
            index,
          ) => {
            const TrendArrow =
              trendArrow === "up" ? ArrowUpOutlined : ArrowDownOutlined;
            return (
              <div
                className={`flex items-start justify-between gap-2 ${index === 0 ? "pr-3" : "px-3"}`}
                key={key}
              >
                <div className="min-w-0">
                  <div className="truncate text-[12px] text-[#595959]">
                    {label}
                  </div>
                  <div
                    className={`text-[22px] font-[700] leading-[1.3] ${valueClass}`}
                  >
                    {value}
                    {unit ? (
                      <span className="ml-0.5 text-[13px] font-[500]">
                        {unit}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[12px]">
                    <span className="text-[#8c8c8c]">较昨日</span>
                    <TrendArrow className={`text-[12px] ${trendClass}`} />
                    <span className={trendClass}>{trendText}</span>
                  </div>
                </div>
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}
                >
                  <Icon className={`text-[20px] ${iconColorClass}`} />
                </div>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}
