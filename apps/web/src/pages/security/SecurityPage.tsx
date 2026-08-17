import { SafetyOutlined, DownloadOutlined } from "@ant-design/icons";
import { Button, Tabs, Typography } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyBlock } from "../../components/common";
import { useAuditExport, useSecurityAuditLogs } from "../../modules/security";
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
import{ Header } from "../../components/common/Header";

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
  const auditExport = useAuditExport();
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
      await auditExport.startExport({
        action: filters.actionType || null,
        from: filters.range?.[0]?.toISOString() ?? null,
        keyword: filters.searchText.trim() || null,
        module: filters.module || null,
        operator: filters.operator || null,
        risk: filters.risk || null,
        to: filters.range?.[1]?.toISOString() ?? null,
      });
      showSuccessMessage("审计导出任务已创建，处理完成后可下载");
    } catch (error) {
      showErrorMessage(error, "创建审计导出任务失败");
    }
  };

  const exportStatus = auditExport.state;

  return (
    <div className="space-y-2">
      
      <Tabs
        activeKey={activeTab}
        items={[
          {
            children: (
              <div className="space-y-2">
                <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
                  <AuditFilterBar
                    actionTypeOptions={actionTypeOptions}
                    exporting={exportStatus.phase === "polling"}
                    moduleOptions={moduleOptions}
                    onChange={(patch) =>
                      setFilters((prev) => ({ ...prev, ...patch }))
                    }
                    onExport={handleExport}
                    operatorOptions={operatorOptions}
                    value={filters}
                  />
                  {exportStatus.phase !== "idle" && (
                    <div className="flex flex-wrap items-center gap-2 px-1 pt-2 text-[13px]">
                      {exportStatus.phase === "polling" && (
                        <span className="text-[#1677ff]">
                          审计导出任务处理中（{exportStatus.exportJobId}
                          ），完成后可下载
                        </span>
                      )}
                      {exportStatus.phase === "completed" && (
                        <>
                          <span className="text-[#52c41a]">
                            审计导出已完成，可下载
                          </span>
                          <Button
                            icon={<DownloadOutlined />}
                            onClick={() => {
                              if (exportStatus.phase !== "completed") return;
                              void auditExport
                                .download(exportStatus.exportJobId)
                                .catch((error: unknown) =>
                                  showErrorMessage(error, "下载审计导出失败"),
                                );
                            }}
                            size="small"
                            type="primary"
                          >
                            下载导出文件
                          </Button>
                        </>
                      )}
                      {exportStatus.phase === "expired" && (
                        <span className="text-[#fa8c16]">
                          审计导出已过期，请重新导出
                        </span>
                      )}
                      {exportStatus.phase === "failed" && (
                        <span className="text-[#ff4d4f]">
                          审计导出失败（
                          {exportStatus.failureCode ?? "未知原因"}
                          ），请重新导出
                        </span>
                      )}
                    </div>
                  )}
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
