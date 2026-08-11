import { CopyOutlined } from "@ant-design/icons";
import { Button, Skeleton, Tag, Typography } from "antd";
import type { ReactNode } from "react";

import { EmptyBlock } from "../../../components/common";
import {
  showSuccessMessage,
  showWarningMessage,
} from "../../../shared/ui/message";
import type { AuditLogRow } from "../../../modules/security";

import { ACTION_TYPE_META, RISK_META } from "./constants";

const { Title } = Typography;

/** 追踪 ID 详情态后缀：16 位表格 ID 扩展为设计图中的 UUID 展示形态。 */
const DETAIL_TRACE_SUFFIX = "9d3f2b1a0c9e7d66";

/** 将 32 位十六进制串格式化为 UUID 展示形态。 */
function formatTraceUuid(hex32: string): string {
  return [
    hex32.slice(0, 8),
    hex32.slice(8, 12),
    hex32.slice(12, 16),
    hex32.slice(16, 20),
    hex32.slice(20),
  ].join("-");
}

/** 复制文本：优先 Clipboard API，失败回退 execCommand。 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.style.opacity = "0";
      textarea.style.position = "fixed";
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

async function handleCopy(text: string, label: string): Promise<void> {
  const ok = await copyText(text);
  if (ok) {
    showSuccessMessage(`${label}已复制`);
  } else {
    showWarningMessage(`${label}复制失败，请手动选择复制`);
  }
}

interface DetailFieldProps {
  align?: "center" | "top";
  children: ReactNode;
  className?: string;
  label: string;
}

/** 详情字段：灰色标签 + 主色值。 */
function DetailField({
  align = "center",
  children,
  className,
  label,
}: DetailFieldProps) {
  return (
    <div
      className={`flex gap-2 ${align === "center" ? "items-center" : "items-start"} ${className ?? ""}`}
    >
      <span className="w-[64px] shrink-0 text-[12px] leading-[1.8] text-[#8c8c8c]">
        {label}
      </span>
      <span className="min-w-0 text-[13px] leading-[1.8] text-[#1f1f1f]">
        {children}
      </span>
    </div>
  );
}

interface AuditLogDetailProps {
  loading: boolean;
  row: AuditLogRow | null;
}

/** 右栏「日志详情」卡：字段列表 + JSON 代码块（行号 + 复制）。 */
export function AuditLogDetail({ loading, row }: AuditLogDetailProps) {
  if (loading) {
    return (
      <section
        aria-label="日志详情"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
      >
        <Skeleton active paragraph={{ rows: 8 }} title={{ width: 96 }} />
      </section>
    );
  }

  if (!row) {
    return (
      <section
        aria-label="日志详情"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
      >
        <Title className="!mb-2" level={4}>
          日志详情
        </Title>
        <EmptyBlock description="请选择左侧日志查看详情" />
      </section>
    );
  }

  const risk = RISK_META[row.detail.riskLevel];
  const traceUuid = formatTraceUuid(row.traceId + DETAIL_TRACE_SUFFIX);
  const entries = Object.entries(row.detail.detailJson);
  const jsonText = `{\n${entries
    .map(([key, value]) => `  "${key}": "${value}"`)
    .join(",\n")}\n}`;

  return (
    <section
      aria-label="日志详情"
      className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
    >
      <Title className="!mb-3" level={4}>
        日志详情
      </Title>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <DetailField label="时间">{row.time}</DetailField>
          <DetailField className="min-w-0 flex-1" label="操作人">
            {row.operatorName}（{row.operatorDepartment}）
          </DetailField>
          <span
            className={`ml-auto flex shrink-0 items-center gap-1.5 text-[12px] ${risk.textClass}`}
          >
            <span
              aria-hidden="true"
              className={`h-[7px] w-[7px] rounded-full ${risk.dotClass}`}
            />
            {row.detail.riskLevel}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <DetailField label="操作类型">
            <Tag
              className="m-0"
              color={ACTION_TYPE_META[row.actionType] ?? "default"}
            >
              {row.actionType}
            </Tag>
          </DetailField>
          <DetailField label="模块">{row.module}</DetailField>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-[64px] shrink-0 text-[12px] text-[#8c8c8c]">
            追踪 ID
          </span>
          <span className="text-[13px] text-[#1f1f1f]">{traceUuid}</span>
          <button
            aria-label="复制追踪 ID"
            className="cursor-pointer border-0 bg-transparent p-0.5 text-[#8c8c8c] transition-colors duration-200 hover:text-[#1677ff]"
            onClick={() => void handleCopy(traceUuid, "追踪 ID ")}
            type="button"
          >
            <CopyOutlined className="text-[14px]" />
          </button>
        </div>
        <div>
          <div className="mb-1 text-[12px] text-[#8c8c8c]">详情内容</div>
          <div className="relative rounded-md border border-solid border-[#f0f0f0] bg-[#fafafa] p-3">
            <Button
              aria-label="复制详情内容"
              className="absolute right-2 top-2"
              onClick={() => void handleCopy(jsonText, "详情内容")}
              size="small"
            >
              复制
            </Button>
            <div
              aria-label="详情内容 JSON"
              className="font-mono text-[12px] leading-[1.8]"
            >
              <div className="flex gap-3">
                <span className="w-4 shrink-0 select-none text-right text-[#bfbfbf]">
                  1
                </span>
                <span className="whitespace-pre text-[#595959]">{"{"}</span>
              </div>
              {entries.map(([key, value], index) => (
                <div className="flex gap-3" key={key}>
                  <span className="w-4 shrink-0 select-none text-right text-[#bfbfbf]">
                    {index + 2}
                  </span>
                  <span className="whitespace-pre">
                    <span className="text-[#cf1322]">
                      {"  "}&quot;{key}&quot;
                    </span>
                    <span className="text-[#595959]">: </span>
                    <span className="text-[#d46b08]">&quot;{value}&quot;</span>
                    <span className="text-[#595959]">
                      {index < entries.length - 1 ? "," : ""}
                    </span>
                  </span>
                </div>
              ))}
              <div className="flex gap-3">
                <span className="w-4 shrink-0 select-none text-right text-[#bfbfbf]">
                  {entries.length + 2}
                </span>
                <span className="whitespace-pre text-[#595959]">{"}"}</span>
              </div>
            </div>
          </div>
        </div>
        <DetailField align="top" label="影响范围">
          {row.detail.impactScope}
        </DetailField>
        <DetailField align="top" label="审计备注">
          {row.detail.auditNote}
        </DetailField>
      </div>
    </section>
  );
}
