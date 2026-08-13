import type { ApplicationStatus, DeliveryChannel } from "@ai-hub/contracts";
import { Alert, Button, Empty, Input, Spin, Switch, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import type {
  AssetRecord,
  DeliveryRecord,
} from "../../modules/application/application.client";
import {
  useApplicationWorkspace,
  useAssets,
  useConfigureDelivery,
  useSubmitApplicationReview,
} from "../../modules/application/useApplication";
import { MessageError } from "../../shared/ui/message";

interface DeliveryDraft {
  entryUrl: string;
  minClientVersion: string;
  enabled: boolean;
}

type DeliveryDrafts = Record<DeliveryChannel, DeliveryDraft>;

const channels: ReadonlyArray<{
  channel: DeliveryChannel;
  label: string;
  icon: string;
}> = [
  { channel: "web", label: "Web 应用", icon: "app-ui-icon-web" },
  { channel: "desktop", label: "桌面端", icon: "app-ui-icon-desktop" },
  { channel: "mobile", label: "移动端", icon: "app-ui-icon-mobile" },
  { channel: "mini_program", label: "小程序", icon: "app-ui-icon-mini" },
];

function emptyDeliveryDrafts(): DeliveryDrafts {
  return {
    web: { enabled: false, entryUrl: "", minClientVersion: "" },
    desktop: { enabled: false, entryUrl: "", minClientVersion: "" },
    mobile: { enabled: false, entryUrl: "", minClientVersion: "" },
    mini_program: { enabled: false, entryUrl: "", minClientVersion: "" },
  };
}

function toDeliveryDraft(delivery: DeliveryRecord): DeliveryDraft {
  return {
    enabled: delivery.enabled,
    entryUrl: delivery.entryUrl,
    minClientVersion: delivery.minClientVersion ?? "",
  };
}

export default function ApplicationDeliveryPage() {
  const { applicationId } = useParams();
  const workspaceQuery = useApplicationWorkspace(applicationId);
  const assets = useAssets(applicationId);
  const configure = useConfigureDelivery(applicationId);
  const submitReview = useSubmitApplicationReview();
  const [activeChannel, setActiveChannel] = useState<DeliveryChannel>("web");
  const [drafts, setDrafts] = useState<DeliveryDrafts>(emptyDeliveryDrafts);
  const [dirtyChannels, setDirtyChannels] = useState<Set<DeliveryChannel>>(
    () => new Set(),
  );

  const workspace = workspaceQuery.data;
  const deliveries = workspace?.deliveries;

  useEffect(() => {
    setDrafts(emptyDeliveryDrafts());
    setDirtyChannels(new Set());
  }, [applicationId]);

  useEffect(() => {
    if (deliveries === undefined) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const delivery of deliveries) {
        if (!dirtyChannels.has(delivery.channel)) {
          next[delivery.channel] = toDeliveryDraft(delivery);
        }
      }
      return next;
    });
  }, [deliveries, dirtyChannels]);

  const activeDraft = drafts[activeChannel];
  const latestVersion = workspace?.versions[0];
  const reviewReadiness = getReviewReadiness(
    workspace?.application.status,
    latestVersion?.scanStatus,
    latestVersion !== undefined,
    workspace?.application.status === "published" &&
      latestVersion?.applicationVersionId ===
        workspace.application.currentVersionId,
  );
  const enabledCount = useMemo(
    () => Object.values(drafts).filter((draft) => draft.enabled).length,
    [drafts],
  );

  const updateDraft = (patch: Partial<DeliveryDraft>) => {
    setDrafts((current) => ({
      ...current,
      [activeChannel]: { ...current[activeChannel], ...patch },
    }));
    setDirtyChannels((current) => new Set(current).add(activeChannel));
  };

  const handleSave = async () => {
    if (applicationId === undefined) return;
    try {
      const saved = await configure.mutateAsync({
        channel: activeChannel,
        input: {
          enabled: activeDraft.enabled,
          entryUrl: activeDraft.entryUrl.trim(),
          minClientVersion: activeDraft.minClientVersion.trim() || null,
        },
      });
      setDrafts((current) => ({
        ...current,
        [activeChannel]: toDeliveryDraft(saved),
      }));
      setDirtyChannels((current) => {
        const next = new Set(current);
        next.delete(activeChannel);
        return next;
      });
    } catch {
      // mutation hook 已统一展示错误；保留当前草稿供用户修正后重试。
    }
  };

  return (
    <ApplicationAdminPage
      description="配置四个独立交付渠道并提交最新版本审核。"
      showNavigation={false}
      title="交付配置"
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(310px,1fr)]">
        <main className="space-y-3">
          <section className="app-admin-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-3">
              <div className="text-[14px] font-semibold text-[#1f2937]">
                应用类型{" "}
                <span className="font-normal text-[#8a94a6]">（交付渠道）</span>
              </div>
              <div className="text-[13px] text-[#596579]">
                已启用交付渠道：
                <strong className="text-[#1f2937]">{enabledCount}</strong> / 4
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-3">
              {channels.map((item) => (
                <Button
                  className={
                    activeChannel === item.channel
                      ? "!border-[#5796ff] !bg-[#f0f7ff] !text-[#1677ff]"
                      : ""
                  }
                  key={item.channel}
                  onClick={() => setActiveChannel(item.channel)}
                >
                  <i
                    aria-hidden="true"
                    className={`app-ui-icon ${item.icon} mr-2`}
                  />
                  {item.label}
                </Button>
              ))}
            </div>
          </section>

          <DeliveryEditor
            assets={assets.query.data ?? []}
            channel={activeChannel}
            draft={activeDraft}
            onChange={updateDraft}
          />

          <div className="space-y-3 rounded-lg border border-[#e2e8f0] bg-white px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-[#1f2937]">
                  最新版本
                  {latestVersion
                    ? ` v${latestVersion.version.replace(/^v/, "")}`
                    : ""}
                </div>
                <div className="mt-1 text-[12px] text-[#697386]">
                  {reviewReadiness.message}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!activeDraft.entryUrl.trim()}
                  loading={configure.isPending}
                  onClick={() => void handleSave()}
                >
                  保存配置
                </Button>
                <Button
                  disabled={
                    !reviewReadiness.ready || latestVersion === undefined
                  }
                  loading={submitReview.isPending}
                  type="primary"
                  onClick={() => {
                    if (latestVersion !== undefined) {
                      submitReview.mutate(latestVersion.applicationVersionId);
                    }
                  }}
                >
                  提交审核
                </Button>
              </div>
            </div>
            {enabledCount < 4 ? (
              <Alert
                title="审核通过后，发布前仍需启用全部四个交付渠道。"
                showIcon
                type="info"
              />
            ) : null}
          </div>
        </main>

        <aside className="space-y-3">
          <SideCard title="渠道状态">
            {channels.map(({ channel, label }) => (
              <div className="flex items-center justify-between" key={channel}>
                <span className="text-[13px] text-[#596579]">{label}</span>
                <Tag color={drafts[channel].enabled ? "success" : "default"}>
                  {drafts[channel].enabled ? "已启用" : "未启用"}
                </Tag>
              </div>
            ))}
          </SideCard>
          <SideCard title="发布门禁">
            <Gate
              label="制品扫描通过"
              passed={latestVersion?.scanStatus === "passed"}
            />
            <Gate
              label="已创建可审核版本"
              passed={latestVersion !== undefined}
            />
            <Gate label="四个渠道全部启用" passed={enabledCount === 4} />
          </SideCard>
          <SideCard title="上传限制">
            <div className="flex justify-between text-[13px]">
              <span className="text-[#596579]">安装包</span>
              <strong className="font-medium text-[#374151]">2 GB</strong>
            </div>
            <div className="text-[12px] leading-5 text-[#8a94a6]">
              桌面端和移动端的资产绑定写接口尚未提供；当前入口地址作为下载或跳转兜底。
            </div>
          </SideCard>
        </aside>
      </div>
      {workspaceQuery.isPending ? <Spin aria-label="交付配置加载中" /> : null}
      <MessageError
        active={workspaceQuery.isError}
        cause={workspaceQuery.error}
        title="交付配置加载失败"
      />
      <MessageError
        active={assets.query.isError}
        cause={assets.query.error}
        title="交付资产加载失败"
      />
    </ApplicationAdminPage>
  );
}

function getReviewReadiness(
  status: ApplicationStatus | undefined,
  scanStatus: "pending" | "passed" | "failed" | undefined,
  hasVersion: boolean,
  isCurrentPublishedVersion: boolean,
): { ready: boolean; message: string } {
  if (!hasVersion) return { ready: false, message: "请先创建版本" };
  if (isCurrentPublishedVersion) {
    return { ready: false, message: "请先创建一个尚未发布的新版本" };
  }
  if (scanStatus !== "passed") {
    return { ready: false, message: "最新版本制品校验未通过" };
  }
  if (status === "in_review") {
    return { ready: false, message: "最新版本正在审核中" };
  }
  if (status === "approved") {
    return { ready: false, message: "应用已通过审核，等待发布" };
  }
  if (status !== "draft" && status !== "published") {
    return { ready: false, message: "当前应用状态不允许提交审核" };
  }
  return { ready: true, message: "最新版本已通过制品校验，可以提交审核" };
}

function DeliveryEditor({
  assets,
  channel,
  draft,
  onChange,
}: {
  assets: AssetRecord[];
  channel: DeliveryChannel;
  draft: DeliveryDraft;
  onChange: (patch: Partial<DeliveryDraft>) => void;
}) {
  const meta = channels.find((item) => item.channel === channel)!;
  const needsClientVersion = channel === "desktop" || channel === "mobile";
  const entryLabel =
    channel === "mini_program"
      ? "小程序入口或二维码内容"
      : needsClientVersion
        ? "下载或启动地址"
        : "企业内网地址";

  return (
    <section className="app-admin-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-3">
        <h3 className="m-0 text-[16px] font-semibold">
          <i
            aria-hidden="true"
            className={`app-ui-icon ${meta.icon} mr-2 text-[#1677ff]`}
          />
          {meta.label}
        </h3>
        <label className="flex items-center gap-2 text-[13px] text-[#596579]">
          启用当前渠道
          <Switch
            aria-label="启用当前渠道"
            checked={draft.enabled}
            onChange={(enabled) => onChange({ enabled })}
          />
        </label>
      </div>
      <div
        className={`grid gap-4 px-5 py-4 ${needsClientVersion ? "md:grid-cols-2" : ""}`}
      >
        <Field label="入口地址">
          <Input
            aria-label="入口地址"
            placeholder={entryLabel}
            value={draft.entryUrl}
            onChange={(event) => onChange({ entryUrl: event.target.value })}
          />
        </Field>
        {needsClientVersion ? (
          <Field label="最低客户端版本">
            <Input
              aria-label="最低客户端版本"
              placeholder="例如：1.0.0"
              value={draft.minClientVersion}
              onChange={(event) =>
                onChange({ minClientVersion: event.target.value })
              }
            />
          </Field>
        ) : null}
      </div>
      {needsClientVersion ? (
        <div className="border-t border-[#edf0f5] px-5 py-4">
          <div className="mb-2 text-[13px] font-medium text-[#374151]">
            可用资产（尚未绑定到当前渠道）
          </div>
          {assets.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无安装包资产"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {assets.map((asset) => (
                <Tag key={asset.assetId}>{asset.name}</Tag>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[13px] font-medium text-[#374151]">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}

function Gate({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <i
        aria-hidden="true"
        className={`app-ui-icon ${passed ? "app-ui-icon-check text-[#20b26b]" : "app-ui-icon-close text-[#8a94a6]"}`}
      />
      <span className={passed ? "text-[#374151]" : "text-[#8a94a6]"}>
        {label}
      </span>
    </div>
  );
}

function SideCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="app-admin-card overflow-hidden">
      <h3 className="app-admin-card-title">{title}</h3>
      <div className="space-y-3 px-5 py-4">{children}</div>
    </section>
  );
}
