import { Empty, Select, Skeleton, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import type { CallDetail, CallPage } from "../../../modules/model-service";
import { MessageError } from "../../../shared/ui/message";
import {
  formatDuration,
  formatShanghaiDateTime,
  formatTokenCount,
} from "../format";

export interface CallFilters {
  errorOnly?: boolean | undefined;
  keyId?: string | undefined;
  model?: string | undefined;
}

export interface CallDetailTableProps {
  error: unknown;
  filters: CallFilters;
  isError: boolean;
  isPending: boolean;
  keyOptions: ReadonlyArray<{ label: string; value: string }>;
  modelOptions: readonly string[];
  onFiltersChange: (patch: Partial<CallFilters>) => void;
  onPageChange: (page: number) => void;
  page: CallPage | undefined;
}

/** HTTP 状态徽标：499 是网关约定的「客户端断流」，单独文案。 */
function StatusTag({ statusCode }: { statusCode: number }) {
  if (statusCode === 499) {
    return <Tag color="orange">客户端断流</Tag>;
  }
  if (statusCode >= 400) {
    return <Tag color="red">{statusCode}</Tag>;
  }
  return <Tag color="green">{statusCode}</Tag>;
}

const ENDPOINT_LABELS: Record<string, string> = {
  chat_completions: "对话补全",
  embeddings: "向量化",
  models: "模型列表",
};

/** 调用明细表：筛选（Key/模型/仅失败）+ 分页；四态由本组件内部收口。 */
export function CallDetailTable({
  error,
  filters,
  isError,
  isPending,
  keyOptions,
  modelOptions,
  onFiltersChange,
  onPageChange,
  page,
}: CallDetailTableProps) {
  const columns: ColumnsType<CallDetail> = [
    {
      dataIndex: "requestedAt",
      key: "requestedAt",
      render: (value: string) => formatShanghaiDateTime(value),
      title: "时间",
      width: 160,
    },
    {
      dataIndex: "model",
      key: "model",
      render: (value: string) => value || "-",
      title: "模型",
      width: 200,
    },
    {
      key: "endpoint",
      render: (_: unknown, record) => (
        <span>
          {ENDPOINT_LABELS[record.endpoint] ?? record.endpoint}
          {record.stream ? (
            <Tag className="ml-1" color="blue">
              流式
            </Tag>
          ) : null}
        </span>
      ),
      title: "端点",
      width: 130,
    },
    {
      key: "tokens",
      render: (_: unknown, record) => (
        <span>
          {formatTokenCount(record.totalTokens)}
          {record.usageEstimated ? (
            <Tag className="ml-1" color="gold" title="上游未返回 usage，本地估算">
              估算
            </Tag>
          ) : null}
        </span>
      ),
      title: "Token",
      width: 130,
    },
    {
      dataIndex: "durationMs",
      key: "durationMs",
      render: (value: number) => formatDuration(value),
      title: "耗时",
      width: 100,
    },
    {
      dataIndex: "statusCode",
      key: "statusCode",
      render: (value: number) => <StatusTag statusCode={value} />,
      title: "状态",
      width: 110,
    },
    {
      dataIndex: "errorCode",
      key: "errorCode",
      render: (value: string | null) => value ?? "-",
      title: "错误码",
      width: 180,
    },
  ];

  return (
    <section
      aria-label="调用明细"
      className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">调用明细</span>
        <Select
          allowClear
          onChange={(value) => onFiltersChange({ keyId: value })}
          options={[...keyOptions]}
          placeholder="全部 Key"
          style={{ width: 180 }}
          value={filters.keyId ?? null}
        />
        <Select
          allowClear
          onChange={(value) => onFiltersChange({ model: value })}
          options={modelOptions.map((model) => ({ label: model, value: model }))}
          placeholder="全部模型"
          style={{ width: 220 }}
          value={filters.model ?? null}
        />
        <span className="flex items-center gap-1 text-sm text-[#595959]">
          仅失败
          <Switch
            checked={filters.errorOnly ?? false}
            onChange={(checked) => onFiltersChange({ errorOnly: checked })}
          />
        </span>
      </div>
      {isPending ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
      <MessageError active={isError} cause={error} title="调用明细加载失败" />
      {page && page.items.length === 0 ? (
        <Empty description="当前筛选条件下暂无调用记录" />
      ) : null}
      {page && page.items.length > 0 ? (
        <Table<CallDetail>
          columns={columns}
          dataSource={page.items}
          pagination={{
            current: page.page,
            onChange: onPageChange,
            pageSize: page.pageSize,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            total: page.total,
          }}
          rowKey="callId"
          size="small"
        />
      ) : null}
    </section>
  );
}
