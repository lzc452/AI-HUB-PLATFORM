import { Button, DatePicker } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo } from "react";

import type { UsageQuery, UsageRangeKey } from "../../../modules/model-service";
import { showWarningMessage } from "../../../shared/ui/message";

const { RangePicker } = DatePicker;

/** 自定义区间上限（与后端 CUSTOM_RANGE_MAX_DAYS 一致，超过即 400，前端先拦一道）。 */
const CUSTOM_RANGE_MAX_DAYS = 90;

const PRESETS: ReadonlyArray<{ key: UsageRangeKey; label: string }> = [
  { key: "today", label: "今日" },
  { key: "7d", label: "近 7 日" },
  { key: "30d", label: "近 30 日" },
];

export interface UsageRangeSwitchProps {
  onChange: (query: UsageQuery) => void;
  value: UsageQuery;
}

/** 区间切换：三种预设 + 自定义（业务日粒度，与后端 range 口径一一对应）。 */
export function UsageRangeSwitch({ onChange, value }: UsageRangeSwitchProps) {
  const activeRange = value.range ?? "today";
  const customValue = useMemo<[Dayjs, Dayjs] | null>(() => {
    if (
      activeRange !== "custom" ||
      value.from === undefined ||
      value.to === undefined
    ) {
      return null;
    }
    return [dayjs(value.from), dayjs(value.to)];
  }, [activeRange, value.from, value.to]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => (
        <Button
          aria-pressed={activeRange === preset.key}
          key={preset.key}
          onClick={() => onChange({ range: preset.key })}
          type={activeRange === preset.key ? "primary" : "default"}
        >
          {preset.label}
        </Button>
      ))}
      <RangePicker
        format="YYYY-MM-DD"
        onChange={(dates) => {
          const from = dates?.[0];
          const to = dates?.[1];
          if (from === null || from === undefined || to === null || to === undefined) {
            return;
          }
          const spanDays = to.endOf("day").diff(from.startOf("day"), "day") + 1;
          if (spanDays > CUSTOM_RANGE_MAX_DAYS) {
            showWarningMessage(`自定义区间最长 ${CUSTOM_RANGE_MAX_DAYS} 天`);
            return;
          }
          onChange({
            from: from.format("YYYY-MM-DD"),
            range: "custom",
            to: to.format("YYYY-MM-DD"),
          });
        }}
        placeholder={["开始日期", "结束日期"]}
        value={customValue}
      />
    </div>
  );
}
