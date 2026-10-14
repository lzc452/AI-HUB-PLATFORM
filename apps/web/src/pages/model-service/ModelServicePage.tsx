import {
  ApiOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  KeyOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Alert, Button, Empty, Skeleton, Table, Typography } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyBlock, StatCard } from "../../components/common";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  type CallFilters,
} from "./components/CallDetailTable";
import { CallDetailTable } from "./components/CallDetailTable";
import { UsageRangeSwitch } from "./components/UsageRangeSwitch";
import { UsageTrendChart } from "./components/UsageTrendChart";
import { formatTokenCount } from "./format";
import {
  type UsageQuery,
  type UsageSummary,
  useMyCalls,
  useMyUsage,
} from "../../modules/model-service";
import { useAuth } from "../../modules/auth/useAuth";

const { Text, Title } = Typography;

const RANGE_LABELS: Record<string, string> = {
  "30d": "近 30 日",
  "7d": "近 7 日",
  custom: "自定义区间",
  today: "今日",
};

function KpiRow({ summary }: { summary: UsageSummary }) {
  const { totals } = summary;
  const cards = [
    {
      icon: <DashboardOutlined aria-hidden="true" />,
      key: "calls",
      label: "调用次数",
      value: formatTokenCount(totals.calls),
    },
    {
      icon: <ExclamationCircleOutlined aria-hidden="true" />,
      key: "errors",
      label: "失败调用",
      value: formatTokenCount(totals.errorCalls),
    },
    {
      icon: <ApiOutlined aria-hidden="true" />,
      key: "prompt",
      label: "输入 Token",
      value: formatTokenCount(totals.promptTokens),
    },
    {
      icon: <ThunderboltOutlined aria-hidden="true" />,
      key: "completion",
      label: "输出 Token",
      value: formatTokenCount(totals.completionTokens),
    },
    {
      icon: <CloudServerOutlined aria-hidden="true" />,
      key: "total",
      label: "Token 合计",
      value: formatTokenCount(totals.totalTokens),
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((card) => (
        <StatCard
          icon={card.icon}
          key={card.key}
          label={card.label}
          value={card.value}
        />
      ))}
    </div>
  );
}

/**
 * 模型服务用量看板（本人视角，PRD 7.4「Key 详情 / 用量」在 M4 的落地形态）。
 *
 * 与 PRD 原始页面清单的差异：M4 后端用量 API 以**员工**为粒度（而非单 Key 详情），
 * 因此看板呈现「本人全部 Key 的汇总 + 按 Key 构成」，单 Key 详情页不在 M4 前端范围内。
 */
export default function ModelServicePage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canReadUsage = hasPermission(PERMISSIONS.MODEL_SERVICE_USAGE_READ);
  const canManageAll = hasPermission(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE_ALL);
  const canReadKeys =
    hasPermission(PERMISSIONS.MODEL_SERVICE_KEY_READ) ||
    hasPermission(PERMISSIONS.MODEL_SERVICE_KEY_MANAGE);

  const [usageQuery, setUsageQuery] = useState<UsageQuery>({ range: "today" });
  const [callFilters, setCallFilters] = useState<CallFilters>({});
  const [callPage, setCallPage] = useState(1);

  const usage = useMyUsage(usageQuery, canReadUsage);
  const calls = useMyCalls(
    { ...usageQuery, ...callFilters, page: callPage, pageSize: 20 },
    canReadUsage,
  );

  const summary = usage.data;

  const keyOptions = useMemo(
    () =>
      (summary?.byKey ?? []).map((item) => ({
        label: item.keyName,
        value: item.keyId,
      })),
    [summary],
  );
  const modelOptions = useMemo(
    () => (summary?.byModel ?? []).map((item) => item.model),
    [summary],
  );

  const handleRangeChange = (query: UsageQuery) => {
    setUsageQuery(query);
    setCallFilters({});
    setCallPage(1);
  };

  const handleFiltersChange = (patch: Partial<CallFilters>) => {
    setCallFilters((prev) => ({ ...prev, ...patch }));
    setCallPage(1);
  };

  return (
    <div className="space-y-4 rounded-md bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Title className="!mb-0" level={1}>
            模型服务
          </Title>
          <Text type="secondary">
            本地大模型网关用量看板（业务日按 Asia/Shanghai 计算）
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UsageRangeSwitch onChange={handleRangeChange} value={usageQuery} />
          {canReadKeys ? (
            <Button
              icon={<KeyOutlined aria-hidden="true" />}
              onClick={() => navigate("/model-service/keys")}
              type="default"
            >
              我的 Key
            </Button>
          ) : null}
          {canManageAll ? (
            <Button
              icon={<CloudServerOutlined aria-hidden="true" />}
              onClick={() => navigate("/model-service/admin")}
              type="default"
            >
              平台管理
            </Button>
          ) : null}
        </div>
      </div>

      {summary?.todayPartial ? (
        <Alert
          message="当日数据为实时统计（聚合任务尚未覆盖当日），与历史日的聚合口径可能存在分钟级差异"
          showIcon
          type="info"
        />
      ) : null}

      {!canReadUsage ? (
        <EmptyBlock
          description="您没有个人用量查看权限。如需查看全平台用量，请使用平台管理页面。"
        />
      ) : null}

      {canReadUsage && usage.isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : null}

      {canReadUsage && usage.isError ? (
        <Empty description="用量数据加载失败">
          <Button onClick={() => void usage.refetch()} size="small" type="primary">
            重试
          </Button>
        </Empty>
      ) : null}

      {canReadUsage && summary && summary.totals.calls === 0 ? (
        <EmptyBlock
          description={`${RANGE_LABELS[summary.range] ?? "所选区间"}内暂无调用记录`}
        />
      ) : null}

      {canReadUsage && summary && summary.totals.calls > 0 ? (
        <>
          <KpiRow summary={summary} />

          <section
            aria-label="日趋势"
            className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
          >
            <div className="mb-2 flex items-baseline justify-between">
              <Title level={5} className="!mb-0 !mt-0 !text-base">
                日趋势
              </Title>
              <Text style={{ color: "#8c8c8c", fontSize: 12 }} type="secondary">
                {summary.fromDate} 至 {summary.toDate}
              </Text>
            </div>
            <UsageTrendChart daily={summary.daily} />
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section
              aria-label="按模型构成"
              className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
            >
              <Title level={5} className="!mb-3 !mt-0 !text-base">
                按模型构成
              </Title>
              <Table
                columns={[
                  {
                    dataIndex: "model",
                    key: "model",
                    render: (value: string) => value || "-",
                    title: "模型",
                  },
                  {
                    dataIndex: "calls",
                    key: "calls",
                    render: (value: number) => formatTokenCount(value),
                    title: "调用",
                    width: 90,
                  },
                  {
                    dataIndex: "errorCalls",
                    key: "errorCalls",
                    render: (value: number) => formatTokenCount(value),
                    title: "失败",
                    width: 90,
                  },
                  {
                    dataIndex: "totalTokens",
                    key: "totalTokens",
                    render: (value: number) => formatTokenCount(value),
                    title: "Token",
                    width: 120,
                  },
                ]}
                dataSource={summary.byModel}
                pagination={false}
                rowKey="model"
                size="small"
              />
            </section>

            <section
              aria-label="按 Key 构成"
              className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
            >
              <Title level={5} className="!mb-3 !mt-0 !text-base">
                按 Key 构成
              </Title>
              <Table
                columns={[
                  {
                    dataIndex: "keyName",
                    key: "keyName",
                    render: (value: string) => value || "-",
                    title: "Key",
                  },
                  {
                    dataIndex: "keyStatus",
                    key: "keyStatus",
                    title: "状态",
                    width: 90,
                  },
                  {
                    dataIndex: "calls",
                    key: "calls",
                    render: (value: number) => formatTokenCount(value),
                    title: "调用",
                    width: 90,
                  },
                  {
                    dataIndex: "errorCalls",
                    key: "errorCalls",
                    render: (value: number) => formatTokenCount(value),
                    title: "失败",
                    width: 90,
                  },
                  {
                    dataIndex: "totalTokens",
                    key: "totalTokens",
                    render: (value: number) => formatTokenCount(value),
                    title: "Token",
                    width: 120,
                  },
                ]}
                dataSource={summary.byKey}
                pagination={false}
                rowKey="keyId"
                size="small"
              />
            </section>
          </div>

          <CallDetailTable
            error={calls.error}
            filters={callFilters}
            isError={calls.isError}
            isPending={calls.isPending}
            keyOptions={keyOptions}
            modelOptions={modelOptions}
            onFiltersChange={handleFiltersChange}
            onPageChange={setCallPage}
            page={calls.data}
          />
        </>
      ) : null}

      {canReadKeys ? (
        <Text style={{ fontSize: 12 }} type="secondary">
          说明：Key 的创建、轮换与删除请前往「我的 Key」；本页面提供用量查看
          {canManageAll ? "，平台管理页提供全平台 Key 代禁用/启用" : ""}。
        </Text>
      ) : null}
    </div>
  );
}
