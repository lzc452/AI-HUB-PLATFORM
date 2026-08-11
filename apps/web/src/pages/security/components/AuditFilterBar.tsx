import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, DatePicker, Input, Select } from "antd";
import type { Dayjs } from "dayjs";

import { ALL_FILTER_OPTION, type AuditFilterValue } from "./constants";

const { RangePicker } = DatePicker;

export interface AuditFilterBarProps {
  /** 模块选项（由容器从数据派生）。 */
  moduleOptions: string[];
  /** 操作类型选项（由容器从数据派生）。 */
  actionTypeOptions: string[];
  /** 操作人选项（由容器从数据派生）。 */
  operatorOptions: string[];
  /** 导出日志点击（demo 环境仅轻提示）。 */
  onExport: () => void;
  /** 当前筛选值（受控，由 SecurityPage 持有）。 */
  value: AuditFilterValue;
  /** 增量更新回调，父组件负责合并状态。 */
  onChange: (patch: Partial<AuditFilterValue>) => void;
}

/** 审计日志筛选栏：纯受控展示组件，状态完全由 SecurityPage 持有。 */
export function AuditFilterBar({
  actionTypeOptions,
  moduleOptions,
  onChange,
  onExport,
  operatorOptions,
  value,
}: AuditFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RangePicker
        format="YYYY-MM-DD HH:mm"
        onChange={(dates) => {
          const next =
            dates && dates[0] && dates[1]
              ? ([dates[0], dates[1]] as [Dayjs, Dayjs])
              : null;
          onChange({ range: next });
        }}
        separator="~"
        showTime={{ format: "HH:mm" }}
        style={{ width: 320 }}
        value={value.range}
      />
      <span className="text-[13px] text-[#1f1f1f]">操作类型</span>
      <Select
        onChange={(next: string) => onChange({ actionType: next })}
        options={[
          ALL_FILTER_OPTION,
          ...actionTypeOptions.map((item) => ({ label: item, value: item })),
        ]}
        style={{ width: 128 }}
        value={value.actionType}
      />
      <span className="text-[13px] text-[#1f1f1f]">操作人</span>
      <Select
        onChange={(next: string) => onChange({ operator: next })}
        options={[
          ALL_FILTER_OPTION,
          ...operatorOptions.map((item) => ({ label: item, value: item })),
        ]}
        style={{ width: 112 }}
        value={value.operator}
      />
      <span className="text-[13px] text-[#1f1f1f]">模块</span>
      <Select
        onChange={(next: string) => onChange({ module: next })}
        options={[
          ALL_FILTER_OPTION,
          ...moduleOptions.map((item) => ({ label: item, value: item })),
        ]}
        style={{ width: 128 }}
        value={value.module}
      />
      <Input
        allowClear
        className="!w-[240px]"
        onChange={(e) => onChange({ searchText: e.target.value })}
        placeholder="搜索追踪 ID / 详情摘要"
        suffix={<SearchOutlined className="text-[#bfbfbf]" />}
        value={value.searchText}
      />
      <Button
        className="ml-auto"
        ghost
        icon={<DownloadOutlined />}
        onClick={onExport}
        type="primary"
      >
        导出日志
      </Button>
    </div>
  );
}
