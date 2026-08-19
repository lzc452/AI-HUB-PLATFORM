import { MoreOutlined } from "@ant-design/icons";
import { Alert, Button, Modal, Select, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { PERMISSIONS } from "@ai-hub/contracts";

import {
  useApplication,
  useApplicationWorkspace,
  useArchiveApplication,
  useAssetImage,
  useTransferApplicationOwner,
  useWithdrawApplication,
} from "../../modules/application/useApplication";
import { useAuth } from "../../modules/auth/useAuth";
import { listDepartmentMembers } from "../../modules/auth/auth.client";
import { iconGradient } from "../../modules/marketplace/catalogMeta";
import type { EmployeeSummary } from "@ai-hub/contracts";
import { SlaCountdown } from "./SlaCountdown";

const { Title } = Typography;

export function OcrApplicationIcon({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="OCR 应用图标"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#8b7cf6] via-[#7258d8] to-[#5c3dc2] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)] ${className}`}
      role="img"
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
      >
        <path
          d="M27 33v-7h7M73 33v-7h-7M27 67v7h7M73 67v7h-7"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <rect
          fill="rgba(255,255,255,.95)"
          height="33"
          rx="7"
          width="47"
          x="26.5"
          y="34"
        />
        <path
          d="M36 55c2-7 5-11 9-11s7 4 9 11c2-7 5-11 9-11s7 4 9 11"
          fill="none"
          stroke="#7258d8"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <text
          fill="#7258d8"
          fontFamily="Arial, sans-serif"
          fontSize="12"
          fontWeight="700"
          textAnchor="middle"
          x="50"
          y="66"
        >
          OCR
        </text>
      </svg>
    </span>
  );
}

const statusMeta = {
  approved: { color: "success", label: "已通过" },
  archived: { color: "default", label: "已归档" },
  draft: { color: "default", label: "草稿" },
  in_review: { color: "warning", label: "待审核" },
  published: { color: "success", label: "已上架" },
  withdrawn: { color: "error", label: "已下架" },
} as const;

export function ApplicationNavigation() {
  const { applicationId = "app-001" } = useParams();
  const items = [
    { label: "基本信息", path: `/applications/${applicationId}` },
    { label: "版本管理", path: `/applications/${applicationId}/versions` },
    { label: "审核记录", path: `/applications/${applicationId}/review` },
    { label: "评价管理", path: `/applications/${applicationId}/reviews` },
    { label: "数据分析", path: `/applications/${applicationId}/analytics` },
  ] as const;

  return (
    <nav aria-label="应用管理导航" className="app-admin-tabs">
      {items.map((item) => (
        <NavLink
          className={({ isActive }) =>
            `app-admin-tab ${isActive ? "app-admin-tab-active" : ""}`
          }
          end={item.label === "基本信息"}
          key={item.path}
          to={item.path}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export interface ApplicationAdminPageProps {
  actions?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
  showNavigation?: boolean;
}

export function ApplicationAdminPage({
  actions,
  children,
  description,
  title,
  showNavigation = title === "应用详情" || title === "版本管理",
}: ApplicationAdminPageProps) {
  const { applicationId = "app-001" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { actor, canAccess } = useAuth();
  const applicationQuery = useApplication(applicationId);
  const workspaceQuery = useApplicationWorkspace(applicationId);
  const application = applicationQuery.data;
  const appName = application?.name ?? "未命名应用";
  const status = statusMeta[application?.status ?? "published"];
  const isDetail = title === "应用详情";
  const isVersions = title === "版本管理";
  const isReview = title === "审核工作台";
  const displayStatus = isReview
    ? { color: "warning", label: "待审核" }
    : status;
  const isOwner =
    application !== undefined &&
    actor !== null &&
    application.ownerEmployeeId === actor.employeeId;
  const canPublish = canAccess({
    allOf: [PERMISSIONS.APPLICATION_PUBLISH],
  });
  const canManageApps = canAccess({
    allOf: [PERMISSIONS.APPLICATION_MANAGE],
  });
  const latestVersion = workspaceQuery.data?.versions?.[0]?.version;
  const iconAsset = workspaceQuery.data?.assets?.find(
    (asset) => asset.assetType === "icon",
  );
  const { objectUrl: iconUrl } = useAssetImage(
    applicationId,
    iconAsset?.assetId,
  );

  const withdraw = useWithdrawApplication();
  const archive = useArchiveApplication();
  const transfer = useTransferApplicationOwner();
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<string | undefined>();
  const [departmentMembers, setDepartmentMembers] = useState<EmployeeSummary[]>(
    [],
  );
  useEffect(() => {
    if (!transferOpen || application === undefined) {
      return;
    }
    let cancelled = false;
    void listDepartmentMembers(application.departmentId)
      .then((members) => {
        if (!cancelled) setDepartmentMembers(members);
      })
      .catch(() => {
        if (!cancelled) setDepartmentMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [transferOpen, application]);

  const handleWithdraw = () => {
    Modal.confirm({
      cancelText: "取消",
      content: `确认将「${appName}」下架？下架后市场将不再展示。`,
      okText: "确认下架",
      okType: "danger",
      onOk: () => withdraw.mutate(applicationId),
      title: "下架应用",
    });
  };

  const handleArchive = () => {
    Modal.confirm({
      cancelText: "取消",
      content: `确认将「${appName}」归档？归档后不可再恢复。`,
      okText: "确认归档",
      okType: "danger",
      onOk: () => archive.mutate(applicationId),
      title: "归档应用",
    });
  };

  return (
    <div className="application-admin-page">
      <Title className="sr-only" level={1}>
        {title}
      </Title>
      <section className="app-admin-hero" aria-label="应用摘要">
        <div className="flex min-w-0 items-center gap-4">
          {iconUrl ? (
            <img
              alt={`${appName} 图标`}
              className="h-[104px] w-[104px] rounded-[20px] object-cover shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]"
              src={iconUrl}
            />
          ) : (
            <span
              aria-label={`${appName} 应用图标`}
              className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-[20px] text-4xl font-semibold text-white"
              role="img"
              style={{ background: iconGradient(applicationId) }}
            >
              {(appName.trim().charAt(0) || "?").toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            {/* {isVersions ? (
              <NavLink
                className="mb-2 block text-[13px] text-[#1677ff]"
                to={`/applications/${applicationId}`}
              >
                返回应用详情
              </NavLink>
            ) : null} */}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[26px] font-semibold leading-tight text-[#141414]">
                {isDetail
                  ? appName
                  : `${isVersions ? "版本历史" : title} — ${appName}`}
              </h2>
              {!isVersions && title !== "交付配置" ? (
                <Tag color={displayStatus.color}>{displayStatus.label}</Tag>
              ) : null}
              {isReview ? <Tag color="error">高优先级</Tag> : null}
            </div>
            {!isVersions ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[#697386]">
                <span>
                  当前版本{": "}
                  <strong className="font-medium text-[#1f2937]">
                    {latestVersion ?? "未发布"}
                  </strong>
                </span>
                <i className="h-4 w-px bg-[#d9dfe8]" />
                <span>
                  所属部门{": "}
                  <strong className="font-medium text-[#1f2937]">
                    {workspaceQuery.data?.departmentName ||
                      application?.departmentId ||
                      "未提供"}
                  </strong>
                </span>
                <i className="h-4 w-px bg-[#d9dfe8]" />
                <span>
                  责任人{": "}
                  <strong className="font-medium text-[#1f2937]">
                    {workspaceQuery.data?.ownerName ||
                      application?.ownerEmployeeId ||
                      "未提供"}
                  </strong>
                </span>
                <i className="h-4 w-px bg-[#d9dfe8]" />
                <span>
                  维护人{": "}
                  <strong className="font-medium text-[#1f2937]">
                    {workspaceQuery.data?.maintainerName ||
                      application?.maintainerEmployeeId ||
                      "未提供"}
                  </strong>
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
          {isDetail ? (
            <>
              <Button
                disabled={!isOwner}
                onClick={() =>
                  navigate(
                    `/creator/create?type=edit&applicationId=${encodeURIComponent(applicationId)}`,
                  )
                }
                title={isOwner ? "在发布向导中继续编辑" : "仅责任人可编辑"}
                type="primary"
              >
                编辑
              </Button>
              <Button
                disabled={application?.status !== "published" || !canPublish}
                onClick={handleWithdraw}
                title={
                  application?.status !== "published"
                    ? "仅已上架应用可下架"
                    : !canPublish
                      ? "需要发布权限"
                      : "下架后市场不再展示"
                }
                color="danger"
                variant="outlined"
              >
                下架
              </Button>
              <Button
                disabled={application?.status !== "withdrawn" || !canPublish}
                onClick={handleArchive}
                title={
                  application?.status !== "withdrawn"
                    ? "仅已下架应用可归档"
                    : !canPublish
                      ? "需要发布权限"
                      : "归档后不可恢复"
                }
                variant="outlined"
                color="orange"
              >
                归档
              </Button>
              <Button
                disabled={!isOwner && !canManageApps}
                onClick={() => {
                  setSelectedOwner(undefined);
                  setTransferOpen(true);
                }}
                title={
                  isOwner || canManageApps
                    ? "将应用移交给其他责任人"
                    : "仅责任人可移交"
                }
              >
                移交责任人
              </Button>
            </>
          ) : null}
          {isVersions ? (
            <div className="grid min-w-[390px] grid-cols-4 divide-x divide-[#edf0f5] text-center">
              {[
                [
                  "当前版本",
                  application?.currentVersionId ?? "未发布",
                  "#1f2937",
                ],
                ["已发布", "—", "#16a66a"],
                ["草稿", "—", "#1f2937"],
                ["审核中", "—", "#f59e0b"],
              ].map(([label, value, color]) => (
                <div key={label} className="px-5">
                  <div className="text-[13px] text-[#697386]">{label}</div>
                  <div
                    className="mt-2 text-[19px] font-semibold"
                    style={{ color }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {isReview ? (
            <div className="grid min-w-[390px] grid-cols-3 divide-x divide-[#edf0f5] text-center">
              <div className="px-5">
                <div className="text-[13px] text-[#697386]">提交时间：</div>
                <div className="mt-2 text-[15px] font-semibold text-[#1f2937]">
                  —
                </div>
              </div>
              <div className="px-5">
                <div className="text-[13px] text-[#697386]">提交人：</div>
                <div className="mt-2 text-[15px] font-semibold text-[#1f2937]">
                  {application?.ownerEmployeeId ?? "—"}
                </div>
              </div>
              <div className="px-5">
                <div className="text-[13px] text-[#697386]">SLA 剩余：</div>
                <SlaCountdown
                  className="mt-2 block text-[20px] font-semibold text-[#f59e0b]"
                  dueAt={workspaceQuery.data?.reviewQueue?.slaDueAt}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {showNavigation ? <ApplicationNavigation /> : null}

      <Modal
        cancelText="取消"
        okButtonProps={{ disabled: !selectedOwner }}
        okText="确认移交"
        onCancel={() => setTransferOpen(false)}
        onOk={() => {
          if (selectedOwner !== undefined) {
            transfer.mutate({ applicationId, ownerEmployeeId: selectedOwner });
          }
          setTransferOpen(false);
        }}
        open={transferOpen}
        title="移交责任人"
      >
        <p className="mb-3 text-sm text-[#8a94a6]">
          移交后新责任人将成为应用的负责人，操作会记录审计。
        </p>
        <Select
          aria-label="新责任人"
          filterOption={(input, option) =>
            String(option?.label ?? "").includes(input)
          }
          onChange={setSelectedOwner}
          options={departmentMembers
            .filter((member) => member.status === "active")
            .map((member) => ({
              label: `${member.displayName}（${member.employeeId}）`,
              value: member.employeeId,
            }))}
          placeholder="选择新的责任人"
          showSearch
          style={{ width: "100%" }}
          value={selectedOwner}
        />
      </Modal>

      <span className="sr-only">{description}</span>
      <Alert
        className="sr-only"
        description="数据已通过内部 API 接入；可用操作受身份与权限控制。"
        showIcon
        title="内部 API 数据"
        type="info"
      />
      {location.pathname.endsWith("/reviews") ||
      location.pathname.endsWith("/analytics") ? (
        <div className="mb-3 flex items-center gap-2 text-sm text-[#8c8c8c]">
          <MoreOutlined /> 此工作台正在建设中
        </div>
      ) : null}
      {children}
    </div>
  );
}
