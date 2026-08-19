import { Button, Empty, Input, Select, Spin, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import type {
  ApplicationVersionRecord,
  VersionDiff,
} from "../../modules/application/application.client";
import {
  useApplicationVersions,
  usePublishedVersion,
  useVersionDiff,
  useVersionSnapshot,
} from "../../modules/application/useApplication";
import { ApiError } from "../../shared/api/client";
import { MessageError } from "../../shared/ui/message";
import { UploadVersionDrawer } from "./UploadVersionDrawer";

/**
 * scanStatus 是制品病毒扫描状态（pending/passed/failed），不是发布/审核状态，
 * 中文标签必须反映「校验」语义，避免与「已发布/审核中」混淆。
 */
const scanStatusMeta: Record<
  ApplicationVersionRecord["scanStatus"],
  { color: string; label: string }
> = {
  failed: { color: "error", label: "校验失败" },
  passed: { color: "success", label: "校验通过" },
  pending: { color: "warning", label: "校验中" },
};

/** 快照顶层字段的中文标签（无映射时回退原字段名）。 */
const snapshotFieldLabels: Readonly<Record<string, string>> = {
  name: "应用名称",
  departmentId: "所属部门",
  maintainerEmployeeIds: "维护人",
  categoryId: "分类",
  applicationType: "应用类型",
  tagIds: "标签",
  icon: "图标",
  screenshotAssetIds: "截图",
  summaryHtml: "简介",
  manualHtml: "用户手册",
  manualAssetId: "手册附件",
  examplesHtml: "使用示例",
  examplesAssetId: "示例附件",
  faq: "FAQ",
  audience: "受众",
  risk: "风险声明",
  deliveries: "交付物",
  version: "版本号",
  changelog: "发布说明",
};

function snapshotFieldLabel(field: string): string {
  return snapshotFieldLabels[field] ?? field;
}

/** 快照值展示：字符串/布尔/数字原样，对象与数组 JSON 序列化。 */
function formatSnapshotValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

export default function ApplicationVersionsPage() {
  const { applicationId } = useParams();
  const versionsQuery = useApplicationVersions(applicationId);
  const publishedVersion = usePublishedVersion(applicationId);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [versionAId, setVersionAId] = useState<string>();
  const [versionBId, setVersionBId] = useState<string>();
  // 点击"开始对比"后生成差异查询目标（from = 旧版本，to = 新版本）。
  const [compareTargets, setCompareTargets] = useState<{
    fromVersionId: string;
    toVersionId: string;
  }>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const versions = versionsQuery.data ?? [];
  const current = publishedVersion.data ?? versions[0];
  const selected =
    versions.find((item) => item.applicationVersionId === selectedVersionId) ??
    current;
  const previous = useMemo(() => {
    if (!selected) return undefined;
    const index = versions.findIndex(
      (item) => item.applicationVersionId === selected.applicationVersionId,
    );
    return versions[index + 1] ?? versions[index - 1];
  }, [selected, versions]);

  // 版本数据就绪后给对比选择器填充默认值（A = 选中版本，B = 上一版本）；
  // 用户手动选择后不再覆盖。
  useEffect(() => {
    if (versionAId === undefined && selected !== undefined) {
      setVersionAId(selected.applicationVersionId);
    }
    if (versionBId === undefined && previous !== undefined) {
      setVersionBId(previous.applicationVersionId);
    }
  }, [previous, selected, versionAId, versionBId]);

  const versionOptions = versions.map((item) => ({
    label: `v${item.version.replace(/^v/, "")}`,
    value: item.applicationVersionId,
  }));
  const compareEnabled =
    versionAId !== undefined &&
    versionBId !== undefined &&
    versionAId !== versionBId;
  const startCompare = () => {
    if (!compareEnabled) return;
    // 差异方向固定为旧 → 新：列表按创建时间倒序，索引大者更旧。
    const indexOf = (id: string) =>
      versions.findIndex((item) => item.applicationVersionId === id);
    const fromId =
      indexOf(versionAId!) > indexOf(versionBId!) ? versionAId! : versionBId!;
    const toId = fromId === versionAId ? versionBId! : versionAId!;
    setCompareTargets({ fromVersionId: fromId, toVersionId: toId });
  };

  const diffQuery = useVersionDiff(
    applicationId,
    compareTargets?.fromVersionId,
    compareTargets?.toVersionId,
  );
  const snapshotQuery = useVersionSnapshot(
    applicationId,
    selected?.applicationVersionId,
  );
  const snapshotMissing =
    snapshotQuery.isError &&
    snapshotQuery.error instanceof ApiError &&
    snapshotQuery.error.code === "VERSION_SNAPSHOT_NOT_FOUND";

  return (
    <ApplicationAdminPage
      actions={
        <Button onClick={() => setUploadOpen(true)} type="primary">
          上传新版本
        </Button>
      }
      description="比较不可变的应用版本及其产物元数据。"
      showNavigation={false}
      title="版本管理"
    >
      <UploadVersionDrawer
        applicationId={applicationId as string}
        onClose={() => setUploadOpen(false)}
        open={uploadOpen}
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(430px,1fr)_minmax(0,2fr)]">
        <section className="app-admin-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f5] p-3">
            <div className="inline-flex rounded-md border border-[#d8e0eb] p-0.5">
              <Button className="!bg-[#1677ff] !text-white" size="small">
                时间轴视图
              </Button>
              <Button size="small" type="text">
                列表视图
              </Button>
            </div>
            <Input
              allowClear
              className="min-w-[180px] flex-1"
              placeholder="搜索版本号 / 发布说明"
              size="small"
            />
          </div>
          <div className="relative px-3 py-2 before:absolute before:bottom-8 before:left-[27px] before:top-5 before:w-px before:bg-[#dbe4f0]">
            {versions.length === 0 && !versionsQuery.isPending ? (
              <Empty className="py-12" description="暂无版本记录" />
            ) : null}
            {versions.map((version, index) => {
              const isCurrent =
                version.applicationVersionId ===
                  current?.applicationVersionId ||
                (!current && index === 0);
              const isSelected =
                version.applicationVersionId === selected?.applicationVersionId;
              const meta = scanStatusMeta[version.scanStatus];
              return (
                <button
                  className={`relative mb-2 flex w-full gap-4 rounded-lg border p-4 text-left transition ${isSelected ? "border-[#5796ff] bg-[#f8fbff] shadow-[0_0_0_1px_#5796ff]" : "border-[#e4eaf2] bg-white hover:border-[#9ebef4]"}`}
                  key={version.applicationVersionId}
                  onClick={() =>
                    setSelectedVersionId(version.applicationVersionId)
                  }
                  type="button"
                >
                  <span
                    className={`relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white ring-1 ${
                      isCurrent
                        ? "bg-[#1677ff] ring-[#1677ff]"
                        : meta.color === "warning"
                          ? "bg-[#f59e0b] ring-[#f59e0b]"
                          : meta.color === "error"
                            ? "bg-[#f5222d] ring-[#f5222d]"
                            : "bg-[#20b26b] ring-[#20b26b]"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-[17px] text-[#1f2937]">
                        v{version.version.replace(/^v/, "")}
                      </strong>
                      {isCurrent ? <Tag color="blue">当前版本</Tag> : null}
                      <Tag color={meta.color}>{meta.label}</Tag>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[#697386]">
                      <span>
                        <i
                          aria-hidden="true"
                          className="app-ui-icon app-ui-icon-calendar mr-1 text-[#8a94a6]"
                        />
                        {formatDate(version.createdAt)}
                      </span>
                      <span>
                        <i
                          aria-hidden="true"
                          className="app-ui-icon app-ui-icon-user mr-1 text-[#8a94a6]"
                        />
                        {version.createdByEmployeeId}
                      </span>
                    </span>
                    <span className="mt-2 block text-[13px] text-[#596579]">
                      {version.changelog}
                    </span>
                  </span>
                  <span
                    className={`hidden shrink-0 self-center rounded-md border px-3 py-1 text-xs sm:block ${isSelected ? "border-[#1677ff] bg-[#1677ff] text-white" : "border-[#d9e1ed] text-[#374151]"}`}
                  >
                    {isCurrent ? "查看详情" : "与当前版本对比"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-[#edf0f5] px-5 py-3 text-[13px] text-[#697386]">
            共 {versions.length} 个版本
          </div>
        </section>

        <div className="space-y-3">
          <section className="app-admin-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-4">
              <div>
                <h3 className="m-0 text-[17px] font-semibold text-[#1f2937]">
                  版本对比
                </h3>
                <p className="m-0 mt-1 text-[13px] text-[#8a94a6]">
                  选择两个版本查看提交内容的字段变化
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span>版本 A</span>
                <Select
                  onChange={setVersionAId}
                  options={versionOptions}
                  placeholder="选择版本"
                  size="small"
                  value={versionAId ?? selected?.applicationVersionId}
                />
                <span>VS</span>
                <Select
                  onChange={setVersionBId}
                  options={versionOptions}
                  placeholder="选择版本"
                  size="small"
                  value={versionBId ?? previous?.applicationVersionId}
                />
                <Button
                  disabled={!compareEnabled}
                  onClick={startCompare}
                  type="primary"
                >
                  开始对比
                </Button>
              </div>
            </div>
            <div className="p-5 text-[13px]">
              {compareTargets === undefined ? (
                <Empty
                  description="选择两个不同版本后点击「开始对比」"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : null}
              {compareTargets !== undefined && diffQuery.isPending ? (
                <Spin aria-label="版本差异加载中" />
              ) : null}
              {compareTargets !== undefined && diffQuery.isError ? (
                <MessageError
                  active
                  cause={diffQuery.error}
                  title="版本差异加载失败"
                />
              ) : null}
              {compareTargets !== undefined &&
              diffQuery.data &&
              !diffQuery.isPending ? (
                <VersionDiffView diff={diffQuery.data} />
              ) : null}
            </div>
          </section>
          <section className="app-admin-card px-5 py-4">
            <h3 className="m-0 text-[16px] font-semibold">版本快照详情</h3>
            {selected === undefined ? (
              <Empty
                className="py-8"
                description="暂无版本记录"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : null}
            {selected !== undefined && snapshotQuery.isPending ? (
              <Spin aria-label="版本快照加载中" />
            ) : null}
            {snapshotMissing ? (
              <Empty
                className="py-8"
                description="该版本无快照记录"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : null}
            {selected !== undefined &&
            snapshotQuery.isError &&
            !snapshotMissing ? (
              <MessageError
                active
                cause={snapshotQuery.error}
                title="版本快照加载失败"
              />
            ) : null}
            {snapshotQuery.data ? (
              <SnapshotDetail
                createdAt={snapshotQuery.data.createdAt}
                payload={snapshotQuery.data.payload}
              />
            ) : null}
          </section>
        </div>
      </div>
      {versionsQuery.isPending ? <Spin aria-label="版本记录加载中" /> : null}
      <MessageError
        active={versionsQuery.isError}
        cause={versionsQuery.error}
        title="版本记录加载失败"
      />
      {publishedVersion.isError ? (
        <MessageError
          active
          cause={publishedVersion.error}
          title="当前版本加载失败"
        />
      ) : null}
    </ApplicationAdminPage>
  );
}

/** 差异结果渲染：changed / added / removed 三组。 */
function VersionDiffView({ diff }: { diff: VersionDiff }) {
  const hasDiff =
    diff.changed.length > 0 || diff.added.length > 0 || diff.removed.length > 0;
  if (!hasDiff) {
    return (
      <Empty
        description="两个版本快照内容一致，无差异"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }
  return (
    <div className="space-y-4">
      {diff.changed.length > 0 ? (
        <div>
          <h4 className="mb-2 text-[14px] font-semibold text-[#1f2937]">
            变化字段（{diff.changed.length}）
          </h4>
          <div className="space-y-1.5">
            {diff.changed.map((change) => (
              <DiffRow
                field={snapshotFieldLabel(change.field)}
                fromValue={formatSnapshotValue(change.from)}
                key={change.field}
                toValue={formatSnapshotValue(change.to)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {diff.added.length > 0 ? (
        <div>
          <h4 className="mb-2 text-[14px] font-semibold text-[#1f2937]">
            新增字段（{diff.added.length}）
          </h4>
          <div className="space-y-1.5">
            {diff.added.map((entry) => (
              <AddedRemovedRow
                field={snapshotFieldLabel(entry.field)}
                key={entry.field}
                label="新版本"
                value={formatSnapshotValue(entry.value)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {diff.removed.length > 0 ? (
        <div>
          <h4 className="mb-2 text-[14px] font-semibold text-[#1f2937]">
            移除字段（{diff.removed.length}）
          </h4>
          <div className="space-y-1.5">
            {diff.removed.map((entry) => (
              <AddedRemovedRow
                field={snapshotFieldLabel(entry.field)}
                key={entry.field}
                label="旧版本"
                value={formatSnapshotValue(entry.value)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DiffRow({
  field,
  fromValue,
  toValue,
}: {
  field: string;
  fromValue: string;
  toValue: string;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_1fr] overflow-hidden rounded border border-[#e2e8f0] text-[12px]">
      <span className="bg-[#f8fafc] px-3 py-2 font-medium">{field}</span>
      <span className="border-l border-[#e2e8f0] bg-[#fff7f7] px-3 py-2 text-[#b5492e]">
        {fromValue}
      </span>
      <span className="border-l border-[#e2e8f0] bg-[#f0fff7] px-3 py-2 text-[#168255]">
        {toValue}
      </span>
    </div>
  );
}

function AddedRemovedRow({
  field,
  label,
  value,
}: {
  field: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_2fr] overflow-hidden rounded border border-[#e2e8f0] text-[12px]">
      <span className="bg-[#f8fafc] px-3 py-2 font-medium">{field}</span>
      <span className="border-l border-[#e2e8f0] px-3 py-2 text-[#697386]">
        {label}
      </span>
      <span className="border-l border-[#e2e8f0] px-3 py-2">{value}</span>
    </div>
  );
}

/** 快照详情：快照时间 + 顶层字段列表。payload 非普通对象（数组/标量）时
 *  整体按 JSON 字符串展示，避免 Object.entries 产出误导性条目。 */
function SnapshotDetail({
  createdAt,
  payload,
}: {
  createdAt: string;
  payload: Record<string, unknown>;
}) {
  const isPlainObject =
    typeof payload === "object" && payload !== null && !Array.isArray(payload);
  const entries = isPlainObject ? Object.entries(payload) : [];
  return (
    <div className="mt-3">
      <p className="mb-3 text-[12px] text-[#697386]">
        快照时间：{formatDateTime(createdAt)}
      </p>
      {!isPlainObject ? (
        <div className="rounded border border-[#edf0f5] px-3 py-2 break-all text-[#596579]">
          {formatSnapshotValue(payload)}
        </div>
      ) : entries.length === 0 ? (
        <Empty
          className="py-6"
          description="该版本快照内容为空"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <div className="grid gap-1.5 text-[13px] text-[#596579] sm:grid-cols-2">
          {entries.map(([field, value]) => (
            <div
              className="flex gap-2 overflow-hidden rounded border border-[#edf0f5] px-3 py-2"
              key={field}
            >
              <span className="w-20 shrink-0 font-medium text-[#1f2937]">
                {snapshotFieldLabel(field)}
              </span>
              <span className="break-all text-[#596579]">
                {formatSnapshotValue(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
