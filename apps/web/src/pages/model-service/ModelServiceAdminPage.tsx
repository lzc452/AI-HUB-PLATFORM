import {
  ApiOutlined,
  ArrowLeftOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Empty,
  Input,
  Select,
  Skeleton,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { PERMISSIONS } from "@ai-hub/contracts";
import { ConfirmModal, StatCard } from "../../components/common";
import {
  type AdminKeyItem,
  type ModelUsage,
  useAdminKeyStatusChange,
  useAdminKeys,
  usePlatformUsage,
} from "../../modules/model-service";
import { useAuth } from "../../modules/auth/useAuth";
import { formatLimit, formatShanghaiShort, formatTokenCount } from "./format";

const { Text, Title } = Typography;

const KEY_STATUS_TAG_COLORS: Record<string, string> = {
  active: "green",
  disabled: "orange",
  revoked: "default",
};

const KEY_STATUS_LABELS: Record<string, string> = {
  active: "活跃",
  disabled: "已禁用",
  revoked: "已撤销",
};

function EffectiveStatusTag({ item }: { item: AdminKeyItem }) {
  if (item.effectiveStatus === "expired") {
    return <Tag color="red">已过期</Tag>;
  }
  return (
    <Tag color={KEY_STATUS_TAG_COLORS[item.status] ?? "default"}>
      {KEY_STATUS_LABELS[item.status] ?? item.status}
    </Tag>
  );
}

function formatLimits(item: AdminKeyItem): string {
  return `RPM ${formatLimit(item.limits.rpm)} / TPM ${formatLimit(
    item.limits.tpm,
  )} / 日 ${formatLimit(item.limits.dailyTokens)}`;
}

/**
 * 模型服务平台管理页（PRD 7.4「平台用量（管理员）」+ M4 管理面 Key 代管理）。
 *
 * 两部分：
 * 1. 平台用量汇总（今日，读 /admin/usage，需 usage.read_all）；
 * 2. 全平台 Key 列表与代禁用/启用（读 /admin/keys，需 key.manage_all）。
 *
 * 与 PRD 7.4 的差异：该页原列的「Top 用户」后端未提供按员工聚合接口，
 * 本版不实现（不在 M4 后端契约内），已在 PRD 回写中登记。
 */
export default function ModelServiceAdminPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canReadPlatformUsage = hasPermission(
    PERMISSIONS.MODEL_SERVICE_USAGE_READ_ALL,
  );

  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  );
  const [keyPage, setKeyPage] = useState(1);

  const platformUsage = usePlatformUsage({ range: "today" }, canReadPlatformUsage);
  const keys = useAdminKeys({
    ...(employeeFilter === "" ? {} : { employeeId: employeeFilter }),
    ...(statusFilter === undefined ? {} : { status: statusFilter }),
    page: keyPage,
    pageSize: 20,
  });
  const changeStatus = useAdminKeyStatusChange();

  const keyColumns: ColumnsType<AdminKeyItem> = [
    {
      dataIndex: "name",
      key: "name",
      render: (value: string) => value || "-",
      title: "Key 名称",
      width: 160,
    },
    {
      dataIndex: "prefix",
      key: "prefix",
      render: (value: string) => (
        <Text code style={{ fontSize: 12 }}>
          {value}…
        </Text>
      ),
      title: "前缀",
      width: 150,
    },
    {
      key: "owner",
      render: (_: unknown, item) => (
        <span>
          {item.owner.displayName}
          <Text style={{ fontSize: 12 }} type="secondary">
            （{item.owner.employeeId}）
          </Text>
          {item.owner.status !== "active" ? (
            <Tag className="ml-1" color="red">
              {item.owner.status}
            </Tag>
          ) : null}
        </span>
      ),
      title: "归属人",
      width: 200,
    },
    {
      key: "status",
      render: (_: unknown, item) => <EffectiveStatusTag item={item} />,
      title: "状态",
      width: 100,
    },
    {
      key: "limits",
      render: (_: unknown, item) => (
        <Text style={{ fontSize: 12 }} type="secondary">
          {formatLimits(item)}
        </Text>
      ),
      title: "限额（RPM/TPM/日Token）",
      width: 260,
    },
    {
      dataIndex: "lastUsedAt",
      key: "lastUsedAt",
      render: (value: string | null) =>
        value === null ? "从未使用" : formatShanghaiShort(value),
      title: "最近使用",
      width: 150,
    },
    {
      dataIndex: "expiresAt",
      key: "expiresAt",
      render: (value: string | null) =>
        value === null ? "长期有效" : formatShanghaiShort(value),
      title: "过期时间",
      width: 150,
    },
    {
      key: "actions",
      render: (_: unknown, item) => {
        if (item.status === "revoked") {
          return <Text type="secondary">已撤销</Text>;
        }
        const disabling = item.status === "active";
        const pending =
          changeStatus.isPending && changeStatus.variables?.keyId === item.keyId;
        return (
          <ConfirmModal
            buttonProps={{
              danger: disabling,
              loading: pending,
              size: "small",
            }}
            buttonText={disabling ? "禁用" : "启用"}
            content={
              disabling
                ? `禁用后，「${item.name}」（${item.owner.displayName}）将立即无法调用网关。确认代员工禁用？`
                : `确认代员工恢复「${item.name}」（${item.owner.displayName}）的使用？`
            }
            onOk={async () => {
              await changeStatus.mutateAsync({
                action: disabling ? "disable" : "enable",
                keyId: item.keyId,
              });
            }}
            title={disabling ? "代员工禁用 Key" : "代员工启用 Key"}
          />
        );
      },
      title: "操作",
      width: 110,
    },
  ];

  const modelColumns: ColumnsType<ModelUsage> = [
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
      width: 100,
    },
    {
      dataIndex: "errorCalls",
      key: "errorCalls",
      render: (value: number) => formatTokenCount(value),
      title: "失败",
      width: 100,
    },
    {
      dataIndex: "totalTokens",
      key: "totalTokens",
      render: (value: number) => formatTokenCount(value),
      title: "Token",
      width: 140,
    },
  ];

  return (
    <div className="space-y-4 rounded-md bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Title className="!mb-0" level={1}>
            模型服务 · 平台管理
          </Title>
          <Text type="secondary">全平台用量与 API Key 代管理</Text>
        </div>
        <Button
          icon={<ArrowLeftOutlined aria-hidden="true" />}
          onClick={() => navigate("/model-service")}
        >
          返回我的用量
        </Button>
      </div>

      {canReadPlatformUsage ? (
        <section
          aria-label="平台用量汇总"
          className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
        >
          <Title level={5} className="!mb-3 !mt-0 !text-base">
            平台用量（今日）
          </Title>
          {platformUsage.isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
          {platformUsage.isError ? (
            <Empty description="平台用量加载失败">
              <Button
                onClick={() => void platformUsage.refetch()}
                size="small"
                type="primary"
              >
                重试
              </Button>
            </Empty>
          ) : null}
          {platformUsage.data ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  icon={<DashboardOutlined aria-hidden="true" />}
                  label="调用次数"
                  value={formatTokenCount(platformUsage.data.totals.calls)}
                />
                <StatCard
                  icon={<ExclamationCircleOutlined aria-hidden="true" />}
                  label="失败调用"
                  value={formatTokenCount(platformUsage.data.totals.errorCalls)}
                />
                <StatCard
                  icon={<ApiOutlined aria-hidden="true" />}
                  label="输入 Token"
                  value={formatTokenCount(platformUsage.data.totals.promptTokens)}
                />
                <StatCard
                  icon={<ThunderboltOutlined aria-hidden="true" />}
                  label="Token 合计"
                  value={formatTokenCount(platformUsage.data.totals.totalTokens)}
                />
              </div>
              {platformUsage.data.totals.calls === 0 ? (
                <Text style={{ fontSize: 12 }} type="secondary">
                  今日暂无平台调用记录。
                </Text>
              ) : (
                <Table<ModelUsage>
                  className="mt-3"
                  columns={modelColumns}
                  dataSource={platformUsage.data.byModel}
                  pagination={false}
                  rowKey="model"
                  size="small"
                />
              )}
              {platformUsage.data.todayPartial ? (
                <Alert
                  className="mt-3"
                  message="当日数据为实时统计（聚合任务尚未覆盖当日）"
                  showIcon
                  type="info"
                />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section
        aria-label="全平台 Key 管理"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
      >
        <Title level={5} className="!mb-3 !mt-0 !text-base">
          全平台 Key
        </Title>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            allowClear
            onChange={(event) => {
              setEmployeeFilter(event.target.value);
              setKeyPage(1);
            }}
            placeholder="按员工工号搜索"
            prefix={<SearchOutlined className="text-[#bfbfbf]" />}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            onChange={(value) => {
              setStatusFilter(value);
              setKeyPage(1);
            }}
            options={[
              { label: "活跃", value: "active" },
              { label: "已禁用", value: "disabled" },
              { label: "已撤销", value: "revoked" },
            ]}
            placeholder="全部状态"
            style={{ width: 140 }}
          />
          <Text style={{ fontSize: 12 }} type="secondary">
            代禁用/启用会记录审计（含操作人与 Key 归属人）
          </Text>
        </div>

        {keys.isPending ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
        {keys.isError ? (
          <Empty description="Key 列表加载失败">
            <Button onClick={() => void keys.refetch()} size="small" type="primary">
              重试
            </Button>
          </Empty>
        ) : null}
        {keys.data && keys.data.items.length === 0 ? (
          <Empty description="当前筛选条件下暂无 Key" />
        ) : null}
        {keys.data && keys.data.items.length > 0 ? (
          <Table<AdminKeyItem>
            columns={keyColumns}
            dataSource={keys.data.items}
            pagination={{
              current: keys.data.page,
              onChange: setKeyPage,
              pageSize: keys.data.pageSize,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 个 Key`,
              total: keys.data.total,
            }}
            rowKey="keyId"
            size="small"
          />
        ) : null}
      </section>
    </div>
  );
}
