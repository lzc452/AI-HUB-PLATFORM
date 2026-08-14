import { LeftOutlined } from "@ant-design/icons";
import { Tabs, Typography } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyBlock } from "../../components/common";
import {
  createAuditExport,
  useSecurityAuditLogs,
} from "../../modules/security";
import { ROUTES } from "../../router/routes";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";

import { AuditFilterBar } from "./components/AuditFilterBar";
import { AuditLogDetail } from "./components/AuditLogDetail";
import { AuditLogTable } from "./components/AuditLogTable";
import {
  createDefaultFilters,
  type AuditFilterValue,
} from "./components/constants";
import { useAuditLogRows } from "./components/hooks/useAuditLogRows";
import { SecurityKpiStats } from "./components/SecurityKpiStats";
import { SecurityOverviewCard } from "./components/SecurityOverviewCard";

const { Title } = Typography;

/** 非审计页签占位（设计图仅给出审计日志页签内容）。 */
const PLACEHOLDER_TABS = [
  { key: "config", label: "安全配置" },
  { key: "session", label: "会话管理" },
  { key: "scan", label: "文件扫描" },
] as const;

/**
 * 系统安全页容器：唯一的数据获取与状态持有位置。
 * 持有 activeTab、筛选状态（单一对象）与选中行；
 * 子组件纯展示，通过 onChange(patch) / onSelect 回传增量。
 */
export default function SecurityPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("audit");
  const [filters, setFilters] =
    useState<AuditFilterValue>(createDefaultFilters);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const { data, isPending } = useSecurityAuditLogs();
  const allRows = useMemo(() => data ?? [], [data]);
  const filteredRows = useAuditLogRows(allRows, filters);

  // 默认选中首行（设计图第 1 行高亮），点击行后切换联动右栏详情
  const effectiveSelectedTraceId =
    selectedTraceId ?? allRows[0]?.traceId ?? null;
  const selectedRow = useMemo(
    () =>
      allRows.find((row) => row.traceId === effectiveSelectedTraceId) ?? null,
    [allRows, effectiveSelectedTraceId],
  );

  const actionTypeOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.actionType))],
    [allRows],
  );
  const operatorOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.operatorName))],
    [allRows],
  );
  const moduleOptions = useMemo(
    () => [...new Set(allRows.map((row) => row.module))],
    [allRows],
  );

  const handleBack = () => {
    // 无历史可回退时回首页，避免离开应用
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(ROUTES.home);
    }
  };

  const handleExport = async () => {
    try {
      const result = await createAuditExport({
        action: filters.actionType,
        from: filters.range?.[0]?.toISOString() ?? null,
        keyword: filters.searchText,
        module: filters.module,
        operator: filters.operator,
        to: filters.range?.[1]?.toISOString() ?? null,
      });
      showSuccessMessage(`审计导出任务已创建（${result.status}）`);
    } catch (error) {
      showErrorMessage(error, "创建审计导出任务失败");
    }
  };

  return (
    <div className="space-y-2">
      <button
        aria-label="返回上一页"
        className="flex cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent p-0 text-[13px] text-[#8c8c8c] transition-colors duration-200 hover:text-[#1677ff]"
        onClick={handleBack}
        type="button"
      >
        <LeftOutlined className="text-[12px]" />
        系统安全
      </button>
      <Title className="!mb-0" level={2}>
        系统安全
      </Title>
      <SecurityKpiStats rows={allRows} />
      <Tabs
        activeKey={activeTab}
        items={[
          {
            children: (
              <div className="space-y-2">
                <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
                  <AuditFilterBar
                    actionTypeOptions={actionTypeOptions}
                    moduleOptions={moduleOptions}
                    onChange={(patch) =>
                      setFilters((prev) => ({ ...prev, ...patch }))
                    }
                    onExport={handleExport}
                    operatorOptions={operatorOptions}
                    value={filters}
                  />
                </div>
                <div className="flex flex-col gap-[16px] lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1 rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
                    <AuditLogTable
                      loading={isPending}
                      onSelect={setSelectedTraceId}
                      rows={filteredRows}
                      selectedTraceId={effectiveSelectedTraceId}
                    />
                  </div>
                  <div className="w-full space-y-2 lg:w-[460px] lg:shrink-0">
                    <AuditLogDetail loading={isPending} row={selectedRow} />
                    <SecurityOverviewCard rows={allRows} />
                  </div>
                </div>
              </div>
            ),
            key: "audit",
            label: "审计日志",
          },
          ...PLACEHOLDER_TABS.map(({ key, label }) => ({
            children: (
              <EmptyBlock description={`「${label}」模块建设中，敬请期待`} />
            ),
            disabled: true,
            key,
            label,
          })),
        ]}
        onChange={setActiveTab}
      />
    </div>
  );
}
