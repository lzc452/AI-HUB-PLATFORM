import { Button, Empty, Spin, Tag, Tooltip, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { AudienceRule } from "@ai-hub/contracts";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import {
  useApplication,
  useApplicationWorkspace,
  useAssetImage,
  useCreatorApplications,
  usePublishedVersion,
} from "../../modules/application/useApplication";
import type { AssetRecord } from "../../modules/application/application.client";
import { useAuth } from "../../modules/auth/useAuth";
import {
  listDepartmentMembers,
  listDepartments,
} from "../../modules/auth/auth.client";
import { getApplicationDraft } from "../../modules/publishing";
import { listCategories, listTags } from "../../modules/publishing/publishing.client";
import { MessageError } from "../../shared/ui/message";

const { Paragraph, Text } = Typography;

const lifecycleStates = [
  "草稿",
  "审核中",
  "已通过",
  "已上架",
  "已驳回",
  "已下架",
  "已归档",
];

export default function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const { actor } = useAuth();
  const applicationQuery = useApplication(applicationId);
  const application = applicationQuery.data;
  const workspaceQuery = useApplicationWorkspace(applicationId);
  const publishedVersion = usePublishedVersion(applicationId, {
    enabled: Boolean(application?.currentVersionId),
  });
  const creatorApplicationsQuery = useCreatorApplications();
  const categoriesQuery = useQuery({
    queryFn: listCategories,
    queryKey: ["catalog", "categories"],
  });
  const tagsQuery = useQuery({
    queryFn: listTags,
    queryKey: ["catalog", "tags"],
  });
  const version = publishedVersion.data;
  const assets = workspaceQuery.data?.assets ?? [];
  const workspace = workspaceQuery.data;
  const isOwner =
    application !== undefined &&
    actor !== null &&
    application.ownerEmployeeId === actor.employeeId;
  const draftQuery = useQuery({
    enabled: Boolean(applicationId && isOwner),
    queryFn: () => getApplicationDraft(applicationId as string),
    queryKey: ["applications", "draft", applicationId],
  });
  const audienceLabels = useAudienceLabels(draftQuery.data?.draft.audience);
  const creatorRecord = creatorApplicationsQuery.data?.items.find(
    (item) => item.applicationId === applicationId,
  );
  const categoryLabel = categoriesQuery.data?.find(
    (category) => category.categoryId === creatorRecord?.categoryId,
  )?.name;
  const tagLabels = (creatorRecord?.tagIds ?? [])
    .map(
      (tagId) =>
        tagsQuery.data?.find((tag) => tag.tagId === tagId)?.name ?? "",
    )
    .filter(Boolean);
  const screenshots = assets.filter(
    (asset) => asset.assetType === "screenshot",
  );
  const attachments = assets.filter(
    (asset) => asset.assetType === "attachment",
  );

  return (
    <ApplicationAdminPage
      description={`${application?.name ?? "获取名称失败"} 的应用信息与发布状态。`}
      title="应用详情"
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(340px,1.1fr)]">
        <main className="app-admin-card overflow-hidden">
          <section className="border-b border-[#edf0f5] px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="m-0 text-[16px] font-semibold text-[#1f2937]">
                    当前版本内容预览
                  </h3>
                  <Tag color="blue">
                    当前版本 {version?.version ?? "暂无已发布版本"}
                  </Tag>
                  <Text type="secondary">
                    {version?.createdAt
                      ? `创建于 ${formatDate(version.createdAt)}`
                      : "暂无版本时间"}
                  </Text>
                </div>
                <Paragraph className="!mb-0 max-w-[760px] text-[14px] leading-6 text-[#596579]">
                  {version?.changelog || application?.summary || "暂无版本说明"}
                </Paragraph>
              </div>
            </div>
          </section>
          <DetailSection title="应用简介">
            {application?.summary || "暂无应用简介"}
          </DetailSection>
          <DetailSection title="版本变更">
            {version?.changelog || "暂无版本变更说明"}
          </DetailSection>
          <section className="border-b border-[#edf0f5] px-6 py-3">
            <h3 className="mb-2 text-[16px] font-semibold text-[#1f2937]">
              关键特性
            </h3>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {[
                ["应用状态", application?.status ?? "unknown"],
                ["安全扫描", version?.scanStatus ?? "unknown"],
                ["SHA-256", version?.artifactSha256 ?? "未提供"],
                ["签名", version?.artifactSignature ? "已签名" : "未提供"],
              ].map(([label, value]) => (
                <div
                  className="flex items-center gap-2 text-[14px] leading-6 text-[#4b5563]"
                  key={label}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1677ff]" />
                  <span>{label}：</span>
                  <span className="min-w-0 truncate">{value}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="border-b border-[#edf0f5] px-6 py-3">
            <h3 className="mb-2 text-[16px] font-semibold text-[#1f2937]">
              截图预览
            </h3>
            {screenshots.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {screenshots.map((asset) => (
                  <AssetPreview
                    applicationId={applicationId}
                    asset={asset}
                    key={asset.assetId}
                  />
                ))}
              </div>
            ) : (
              <Empty description="暂无截图资产" />
            )}
          </section>
          <section className="px-6 py-3">
            <h3 className="mb-1 text-[16px] font-semibold text-[#1f2937]">
              相关附件
            </h3>
            <div className="divide-y divide-[#edf0f5]">
              {attachments.length > 0 ? (
                attachments.map((asset) => (
                  <div
                    className="flex min-h-[44px] items-center gap-3 text-[13px]"
                    key={asset.assetId}
                  >
                    <i
                      aria-hidden="true"
                      className="app-ui-icon app-ui-icon-file text-lg"
                      style={{ color: "#3789d8" }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[#374151]">
                      {asset.name}
                    </span>
                    <span className="w-20 text-right text-[#8a94a6]">
                      {formatBytes(asset.sizeBytes)}
                    </span>
                    <span className="hidden w-24 text-right text-[#8a94a6] sm:block">
                      {formatDate(asset.createdAt)}
                    </span>
                    <Tooltip title="附件下载暂未纳入 V1 交付契约">
                      <Button
                        aria-label={`下载 ${asset.name}`}
                        disabled
                        size="small"
                      >
                        下载
                      </Button>
                    </Tooltip>
                  </div>
                ))
              ) : (
                <Empty description="暂无附件资产" />
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-3">
          <InfoCard title="应用信息">
            <InfoRow
              label="分类："
              value={categoryLabel ?? "未设置"}
            />
            <InfoRow
              label="标签："
              value={tagLabels.length > 0 ? tagLabels.join("、") : "未设置"}
            />
            <InfoRow
              label="最近更新："
              value={
                workspace?.updatedAt ? formatDate(workspace.updatedAt) : "未提供"
              }
            />
          </InfoCard>
          <InfoCard title="可见范围 / 受众">
            <InfoRow
              label="可见部门："
              value={audienceLabels.department ?? "由后端受众策略判定"}
            />
            <InfoRow
              label="目标用户："
              value={audienceLabels.employee ?? "由后端受众策略判定"}
            />
          </InfoCard>
          <InfoCard title="维护团队">
            <InfoRow
              label="责任人："
              value={
                workspace?.ownerName ||
                application?.ownerEmployeeId ||
                "未提供"
              }
            />
            <InfoRow
              label="维护人："
              value={
                workspace?.maintainerName ||
                application?.maintainerEmployeeId ||
                "未提供"
              }
            />
            <InfoRow
              label="最近操作："
              value={
                workspace?.updatedAt
                  ? `${formatDate(workspace.updatedAt)}`
                  : "暂无操作记录"
              }
            />
          </InfoCard>
          <InfoCard title="发布状态">
            <div className="relative space-y-4 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-[#cbd5e1]">
              {[
                [
                  application?.status ?? "unknown",
                  version?.createdAt ?? "",
                  "当前状态",
                  "#1677ff",
                ],
              ].map(([label, date, desc, color]) => (
                <div className="relative" key={String(label)}>
                  <span
                    className="absolute -left-5 top-0.5 h-3 w-3 rounded-full border-2 border-white"
                    style={{
                      background: String(color),
                      boxShadow: `0 0 0 1px ${String(color)}`,
                    }}
                  />
                  <div className="text-[14px] font-medium text-[#374151]">
                    {label}
                  </div>
                  <div className="text-[12px] text-[#8a94a6]">
                    {date} / {desc}
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>
        </aside>
      </div>
      {applicationQuery.isPending || workspaceQuery.isPending ? (
        <Spin aria-label="应用数据加载中" />
      ) : null}
      <MessageError
        active={applicationQuery.isError}
        cause={applicationQuery.error}
        title="应用数据加载失败"
      />
      {publishedVersion.isError ? (
        <MessageError
          active
          cause={publishedVersion.error}
          title="当前版本加载失败"
        />
      ) : null}
      {workspaceQuery.isError ? (
        <MessageError
          active
          cause={workspaceQuery.error}
          title="应用工作区加载失败"
        />
      ) : null}
      {applicationQuery.data === null ? (
        <Empty description="暂无应用信息" />
      ) : null}
      <div className="sr-only" aria-label="应用生命周期状态">
        {lifecycleStates.map((state) => (
          <span key={state}>{state}</span>
        ))}
        <span>当前版本</span>
      </div>
    </ApplicationAdminPage>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#edf0f5] px-6 py-3">
      <h3 className="mb-1 text-[16px] font-semibold text-[#1f2937]">{title}</h3>
      <p className="m-0 text-[14px] leading-6 text-[#596579]">{children}</p>
    </section>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="app-admin-card overflow-hidden">
      <h3 className="app-admin-card-title">{title}</h3>
      <div className="space-y-2 px-5 py-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-[13px] leading-6">
      <span className="w-[82px] shrink-0 text-[#8a94a6]">{label}</span>
      <span className="min-w-0 flex-1 text-[#374151]">{value}</span>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "未提供"
    : date.toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

/** 将草稿受众规则映射为可读的部门/员工名称。 */
function useAudienceLabels(audience: readonly AudienceRule[] | undefined): {
  department: string | null;
  employee: string | null;
} {
  const departmentsQuery = useQuery({
    queryFn: listDepartments,
    queryKey: ["identity", "departments"],
  });
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  const departmentIds = [
    ...new Set(
      (audience ?? [])
        .filter(
          (rule) =>
            rule.audienceType === "department" && rule.departmentId !== null,
        )
        .map((rule) => rule.departmentId as string),
    ),
  ];
  const departmentKey = departmentIds.join(",");

  useEffect(() => {
    if (departmentIds.length === 0) {
      setMemberNames({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      departmentIds.map((id) =>
        listDepartmentMembers(id).catch(() => []),
      ),
    ).then((groups) => {
      if (cancelled) return;
      const names: Record<string, string> = {};
      for (const group of groups) {
        for (const member of group) {
          names[member.employeeId] = member.displayName;
        }
      }
      setMemberNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [departmentKey]);

  if (!audience || audience.length === 0) {
    return { department: null, employee: null };
  }

  const departmentLabels: string[] = [];
  const employeeLabels: string[] = [];
  for (const rule of audience) {
    if (rule.audienceType === "all") {
      departmentLabels.push("全员");
      employeeLabels.push("全员");
    } else if (rule.audienceType === "department" && rule.departmentId) {
      departmentLabels.push(
        departmentsQuery.data?.find(
          (department) => department.departmentId === rule.departmentId,
        )?.name ?? rule.departmentId,
      );
    } else if (rule.audienceType === "employee" && rule.employeeId) {
      employeeLabels.push(
        memberNames[rule.employeeId] ?? rule.employeeId,
      );
    }
  }
  return {
    department:
      departmentLabels.length > 0 ? departmentLabels.join("、") : null,
    employee: employeeLabels.length > 0 ? employeeLabels.join("、") : null,
  };
}

function AssetPreview({
  applicationId,
  asset,
}: {
  applicationId: string | undefined;
  asset: AssetRecord;
}) {
  const { objectUrl } = useAssetImage(applicationId, asset.assetId);
  if (objectUrl !== null && asset.mimeType.startsWith("image/")) {
    return (
      <div className="flex min-h-[72px] items-center gap-3 rounded-md border border-[#d8e0eb] bg-[#f8fbff] p-3">
        <img
          alt={asset.name}
          className="h-20 w-20 rounded-md border border-[#d8e0eb] object-cover"
          src={objectUrl}
        />
        <div className="min-w-0">
          <div className="truncate text-sm text-[#374151]">{asset.name}</div>
          <div className="text-xs text-[#8a94a6]">
            {asset.mimeType} · {formatBytes(asset.sizeBytes)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-[72px] items-center gap-3 rounded-md border border-[#d8e0eb] bg-[#f8fbff] p-3">
      <i
        aria-hidden="true"
        className="app-ui-icon app-ui-icon-file text-xl text-[#3789d8]"
      />
      <div className="min-w-0">
        <div className="truncate text-sm text-[#374151]">{asset.name}</div>
        <div className="text-xs text-[#8a94a6]">
          {asset.mimeType} · {formatBytes(asset.sizeBytes)}
        </div>
      </div>
    </div>
  );
}
