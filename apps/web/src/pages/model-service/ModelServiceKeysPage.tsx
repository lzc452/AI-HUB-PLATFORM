import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Empty,
  Skeleton,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ConfirmModal, EmptyBlock } from "../../components/common";
import {
  type ApiKeySummary,
  type CreateApiKeyResult,
  useApiKeyStatusChange,
  useCreateApiKey,
  useMyKeys,
  useRevokeApiKey,
  useRotateApiKey,
} from "../../modules/model-service";
import { ApiKeyFormModal } from "./components/ApiKeyFormModal";
import { OneTimeKeyModal } from "./components/OneTimeKeyModal";
import { formatLimit, formatShanghaiShort, formatTokenCount } from "./format";

const { Text, Title } = Typography;

const STATUS_TAG_COLORS: Record<string, string> = {
  active: "green",
  disabled: "orange",
  revoked: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "活跃",
  disabled: "已禁用",
  revoked: "已撤销",
};

function StatusTag({ item }: { item: ApiKeySummary }) {
  if (item.effectiveStatus === "expired") {
    return <Tag color="red">已过期</Tag>;
  }
  return (
    <Tag color={STATUS_TAG_COLORS[item.status] ?? "default"}>
      {STATUS_LABELS[item.status] ?? item.status}
    </Tag>
  );
}

function formatLimits(item: ApiKeySummary): string {
  return `RPM ${formatLimit(item.limits.rpm)} / TPM ${formatLimit(
    item.limits.tpm,
  )} / 日 ${formatLimit(item.limits.dailyTokens)}`;
}

/**
 * 本人 Key 管理页（PRD 7.4「模型服务 / Key 列表」）。
 *
 * 覆盖全生命周期：创建（一次性明文）、禁用/启用、轮换（无宽限期）、删除（撤销）。
 * 数据权限为本人：越权 keyId 一律表现为 404（不泄露存在性）。
 */
export default function ModelServiceKeysPage() {
  const navigate = useNavigate();
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [page, setPage] = useState(1);

  const keys = useMyKeys({ includeRevoked, page, pageSize: 20 });
  const createKey = useCreateApiKey();
  const changeStatus = useApiKeyStatusChange();
  const rotate = useRotateApiKey();
  const revoke = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [plaintext, setPlaintext] = useState<{
    result: CreateApiKeyResult;
    scene: "create" | "rotate";
  } | null>(null);

  const handleCreate = async (input: Parameters<typeof createKey.mutateAsync>[0]) => {
    const result = await createKey.mutateAsync(input);
    setPlaintext({ result, scene: "create" });
  };

  const handleRotate = async (keyId: string) => {
    const result = await rotate.mutateAsync(keyId);
    setPlaintext({ result, scene: "rotate" });
  };

  const columns: ColumnsType<ApiKeySummary> = [
    {
      dataIndex: "name",
      key: "name",
      render: (value: string, item) => (
        <Button
          onClick={() => navigate(`/model-service/${item.keyId}`)}
          type="link"
        >
          {value}
        </Button>
      ),
      title: "Key 名称",
      width: 180,
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
      width: 170,
    },
    {
      key: "status",
      render: (_: unknown, item) => <StatusTag item={item} />,
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
      width: 280,
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
        return (
          <div className="flex flex-wrap gap-1">
            <ConfirmModal
              buttonProps={{
                danger: disabling,
                size: "small",
              }}
              buttonText={disabling ? "禁用" : "启用"}
              content={
                disabling
                  ? `禁用后「${item.name}」将立即无法调用网关，确认禁用？`
                  : `确认恢复「${item.name}」的使用？`
              }
              onOk={async () => {
                await changeStatus.mutateAsync({
                  action: disabling ? "disable" : "enable",
                  keyId: item.keyId,
                });
              }}
              title={disabling ? "禁用 Key" : "启用 Key"}
            />
            <ConfirmModal
              buttonProps={{ size: "small" }}
              buttonText="轮换"
              content={
                <span>
                  轮换会立即撤销「{item.name}」并生成新 Key（无宽限期），
                  正在使用旧 Key 的服务将马上失效，确认轮换？
                </span>
              }
              onOk={async () => {
                await handleRotate(item.keyId);
              }}
              title="轮换 Key"
            />
            <ConfirmModal
              buttonProps={{ danger: true, size: "small" }}
              buttonText="删除"
              content={`删除即撤销「${item.name}」，调用记录与审计仍保留可查，且不可恢复。确认删除？`}
              danger
              onOk={async () => {
                await revoke.mutateAsync(item.keyId);
              }}
              title="删除 Key"
            />
          </div>
        );
      },
      title: "操作",
      width: 220,
    },
  ];

  const busy =
    createKey.isPending || changeStatus.isPending || rotate.isPending || revoke.isPending;

  return (
    <div className="space-y-4 rounded-md bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Title className="!mb-0" level={1}>
            我的 API Key
          </Title>
          <Text type="secondary">
            用于服务端或本地脚本调用本地大模型网关；禁止在浏览器端使用
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 text-sm text-[#595959]">
            显示已撤销
            <Switch
              checked={includeRevoked}
              onChange={(checked) => {
                setIncludeRevoked(checked);
                setPage(1);
              }}
            />
          </span>
          <Button
            icon={<PlusOutlined aria-hidden="true" />}
            onClick={() => setCreateOpen(true)}
            type="primary"
          >
            创建 Key
          </Button>
        </div>
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
        <EmptyBlock
          action={
            <Button onClick={() => setCreateOpen(true)} type="primary">
              创建第一个 Key
            </Button>
          }
          description={
            includeRevoked ? "暂无 Key（含已撤销）" : "暂无可用 Key，创建后即可调用网关"
          }
        />
      ) : null}
      {keys.data && keys.data.items.length > 0 ? (
        <Table<ApiKeySummary>
          columns={columns}
          dataSource={keys.data.items}
          pagination={{
            current: keys.data.page,
            onChange: setPage,
            pageSize: keys.data.pageSize,
            showSizeChanger: false,
            showTotal: (total) => `共 ${formatTokenCount(total)} 个 Key`,
            total: keys.data.total,
          }}
          rowKey="keyId"
          size="small"
        />
      ) : null}

      <Alert
        message="安全提示"
        description="明文 Key 只在创建/轮换时展示一次；服务端仅存储摘要，丢失无法找回。发现泄露请立即禁用或轮换。"
        showIcon
        type="info"
      />

      <ApiKeyFormModal
        mode="create"
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        open={createOpen}
        pending={busy}
      />
      <OneTimeKeyModal
        onClose={() => setPlaintext(null)}
        result={plaintext?.result ?? null}
        scene={plaintext?.scene ?? "create"}
      />
    </div>
  );
}
