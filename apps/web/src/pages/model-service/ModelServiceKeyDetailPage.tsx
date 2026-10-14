import { ArrowLeftOutlined } from "@ant-design/icons";
import {
  Button,
  Descriptions,
  Empty,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ConfirmModal } from "../../components/common";
import {
  type CreateApiKeyResult,
  useApiKey,
  useApiKeyStatusChange,
  useMyCalls,
  useMyUsage,
  useRotateApiKey,
  useUpdateApiKey,
} from "../../modules/model-service";
import { ApiKeyFormModal } from "./components/ApiKeyFormModal";
import {
  type CallFilters,
  CallDetailTable,
} from "./components/CallDetailTable";
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

/** expiresAt → 「从当前起还剩多少天」的近似值（后端按保存时刻重算，用户可改）。 */
function approximateRemainingDays(expiresAt: string | null): number | null {
  if (expiresAt === null) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Key 详情页（PRD 7.4「Key 详情 / 用量」在 M4 的落地形态）。
 *
 * 与 PRD 原始页面清单的差异：M4 后端用量 API 以员工为粒度，
 * 单 Key 汇总从看板「按 Key 构成」中取本 Key 一行，明细按 keyId 过滤。
 */
export default function ModelServiceKeyDetailPage() {
  const { keyId } = useParams<{ keyId: string }>();
  const navigate = useNavigate();

  const key = useApiKey(keyId);
  const changeStatus = useApiKeyStatusChange();
  const rotate = useRotateApiKey();
  const updateKey = useUpdateApiKey(keyId);

  const [editOpen, setEditOpen] = useState(false);
  const [plaintext, setPlaintext] = useState<{
    result: CreateApiKeyResult;
    scene: "rotate";
  } | null>(null);
  const [callFilters, setCallFilters] = useState<CallFilters>({});
  const [callPage, setCallPage] = useState(1);

  const item = key.data;
  // 近 30 日用量（按 Key 构成里取本 Key 一行）+ 模型筛选选项
  const usage = useMyUsage({ range: "30d" }, item !== undefined);
  const calls = useMyCalls(
    { ...callFilters, keyId, page: callPage, pageSize: 20, range: "30d" },
    item !== undefined,
  );

  const keyUsage = useMemo(
    () => usage.data?.byKey.find((row) => row.keyId === keyId) ?? null,
    [usage.data, keyId],
  );
  const modelOptions = useMemo(
    () => (usage.data?.byModel ?? []).map((row) => row.model),
    [usage.data],
  );

  if (key.isPending) {
    return (
      <div className="rounded-md bg-white p-4">
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (key.isError || item === undefined) {
    return (
      <div className="rounded-md bg-white p-4">
        <Empty description="Key 不存在或无权访问">
          <Button
            onClick={() => navigate("/model-service/keys")}
            type="primary"
          >
            返回 Key 列表
          </Button>
        </Empty>
      </div>
    );
  }

  const editValues = {
    dailyTokenLimit: item.limits.dailyTokens,
    expiresInDays: approximateRemainingDays(item.expiresAt),
    name: item.name,
    rpmLimit: item.limits.rpm,
    tpmLimit: item.limits.tpm,
  };

  const handleRotate = async () => {
    const result = await rotate.mutateAsync(item.keyId);
    setPlaintext({ result, scene: "rotate" });
  };

  return (
    <div className="space-y-4 rounded-md bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            icon={<ArrowLeftOutlined aria-hidden="true" />}
            onClick={() => navigate("/model-service/keys")}
          >
            返回
          </Button>
          <div>
            <Title className="!mb-0" level={1}>
              {item.name}
            </Title>
            <Text code style={{ fontSize: 12 }}>
              {item.prefix}…
            </Text>
          </div>
        </div>
        <Space wrap>
          <Button onClick={() => setEditOpen(true)}>编辑属性</Button>
          {item.status === "revoked" ? null : (
            <>
              <ConfirmModal
                buttonProps={{ danger: item.status === "active" }}
                buttonText={item.status === "active" ? "禁用" : "启用"}
                content={
                  item.status === "active"
                    ? `禁用后「${item.name}」将立即无法调用网关，确认禁用？`
                    : `确认恢复「${item.name}」的使用？`
                }
                onOk={async () => {
                  await changeStatus.mutateAsync({
                    action: item.status === "active" ? "disable" : "enable",
                    keyId: item.keyId,
                  });
                }}
                title={item.status === "active" ? "禁用 Key" : "启用 Key"}
              />
              <ConfirmModal
                buttonText="轮换"
                content={
                  <span>
                    轮换会立即撤销当前 Key 并生成新 Key（无宽限期）， 正在使用旧
                    Key 的服务将马上失效，确认轮换？
                  </span>
                }
                onOk={handleRotate}
                title="轮换 Key"
              />
            </>
          )}
        </Space>
      </div>

      <Descriptions
        bordered
        column={{ md: 2, sm: 1 }}
        size="small"
        items={[
          {
            children:
              item.effectiveStatus === "expired" ? (
                <Tag color="red">已过期</Tag>
              ) : (
                <Tag color={STATUS_TAG_COLORS[item.status] ?? "default"}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Tag>
              ),
            key: "status",
            label: "状态",
          },
          {
            children: formatShanghaiShort(item.createdAt),
            key: "createdAt",
            label: "创建时间",
          },
          {
            children:
              item.lastUsedAt === null
                ? "从未使用"
                : formatShanghaiShort(item.lastUsedAt),
            key: "lastUsedAt",
            label: "最近使用",
          },
          {
            children:
              item.expiresAt === null
                ? "长期有效"
                : formatShanghaiShort(item.expiresAt),
            key: "expiresAt",
            label: "过期时间",
          },
          {
            children: `RPM ${formatLimit(item.limits.rpm)}`,
            key: "rpm",
            label: "RPM 上限",
          },
          {
            children: `TPM ${formatLimit(item.limits.tpm)}`,
            key: "tpm",
            label: "TPM 上限",
          },
          {
            children: `每日 ${formatLimit(item.limits.dailyTokens)} Token`,
            key: "daily",
            label: "每日 Token 配额",
          },
        ]}
      />

      <section
        aria-label="该 Key 近 30 日用量"
        className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
      >
        <Title level={5} className="!mb-3 !mt-0 !text-base">
          近 30 日用量
        </Title>
        {usage.isPending ? (
          <Skeleton active paragraph={false} title={false} />
        ) : null}
        {usage.isError ? (
          <Text style={{ fontSize: 12 }} type="danger">
            用量加载失败
          </Text>
        ) : null}
        {usage.data ? (
          <div className="grid grid-cols-3 gap-3">
            <Statistic
              title="调用次数"
              value={formatTokenCount(keyUsage?.calls ?? 0)}
            />
            <Statistic
              title="失败调用"
              value={formatTokenCount(keyUsage?.errorCalls ?? 0)}
            />
            <Statistic
              title="Token 合计"
              value={formatTokenCount(keyUsage?.totalTokens ?? 0)}
            />
          </div>
        ) : null}
      </section>

      <CallDetailTable
        error={calls.error}
        filters={callFilters}
        isError={calls.isError}
        isPending={calls.isPending}
        keyOptions={[]}
        lockedKeyId={item.keyId}
        modelOptions={modelOptions}
        onFiltersChange={(patch) => {
          setCallFilters((prev) => ({ ...prev, ...patch }));
          setCallPage(1);
        }}
        onPageChange={setCallPage}
        page={calls.data}
      />

      <ApiKeyFormModal
        initialValues={editValues}
        mode="edit"
        onClose={() => setEditOpen(false)}
        onUpdate={async (input) => {
          await updateKey.mutateAsync(input);
        }}
        open={editOpen}
        pending={updateKey.isPending}
      />
      <OneTimeKeyModal
        onClose={() => setPlaintext(null)}
        result={plaintext?.result ?? null}
        scene="rotate"
      />
    </div>
  );
}
