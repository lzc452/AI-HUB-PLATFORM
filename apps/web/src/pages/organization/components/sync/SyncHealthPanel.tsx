import { Progress, Typography } from "antd";

import { type SyncHealthData, formatNumber } from "./constants";

const { Text } = Typography;

interface SyncHealthPanelProps {
  health: SyncHealthData;
}

/** 同步健康度面板：环形进度 + 图例。使用 antd Progress，无自定义 SVG。 */
export function SyncHealthPanel({ health }: SyncHealthPanelProps) {
  const items = [
    { color: "#52c41a", key: "success", label: "成功任务", ...health.success },
    { color: "#ff4d4f", key: "failed", label: "失败任务", ...health.failed },
    { color: "#1677ff", key: "inProgress", label: "进行中", ...health.inProgress },
    { color: "#bfbfbf", key: "pending", label: "待执行", ...health.pending },
  ];

  return (
    <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-base font-medium text-[#1f1f1f]">同步健康度</h3>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative flex flex-col items-center justify-center">
          <Progress
            format={() => (
              <div className="text-center">
                <div className="text-xl font-semibold text-[#1f1f1f]">
                  {health.success.rate}%
                </div>
                <div className="text-xs text-[#595959]">成功率</div>
              </div>
            )}
            percent={health.success.rate}
            size={120}
            strokeColor="#52c41a"
            type="circle"
          />
        </div>
        <div className="flex-1 space-y-2">
          {items.map(({ color, count, key, label, rate }) => (
            <div key={key} className="flex items-center justify-between text-[13px]">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <Text className="text-[13px] text-[#1f1f1f]">{label}</Text>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[#1f1f1f]">{formatNumber(count)}</span>
                <span className="w-10 text-right text-[#595959]">
                  {rate > 0 ? `${rate}%` : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 text-xs text-[#8c8c8c]">
        数据统计周期：2025-05-25 ~ 2025-06-01
      </div>
    </section>
  );
}
