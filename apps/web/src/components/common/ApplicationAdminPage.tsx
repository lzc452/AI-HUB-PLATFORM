import { MoreOutlined } from "@ant-design/icons";
import { Alert, Button, Tag, Typography } from "antd";
import { NavLink, useLocation, useParams } from "react-router-dom";

import { useApplication } from "../../modules/application/useApplication";
import { showWarningMessage } from "../../shared/ui/message";

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
  const applicationQuery = useApplication(applicationId);
  const application = applicationQuery.data;
  const appName = application?.name ?? "OCR 票据识别";
  const status = statusMeta[application?.status ?? "published"];
  const isDetail = title === "应用详情";
  const isVersions = title === "版本管理";
  const isReview = title === "审核工作台";
  const isDelivery = title === "交付配置";
  const displayStatus = isReview
    ? { color: "warning", label: "待审核" }
    : status;

  return (
    <div className="application-admin-page">
      <Title className="sr-only" level={1}>
        {title}
      </Title>
      <section className="app-admin-hero" aria-label="应用摘要">
        <div className="flex min-w-0 items-center gap-4">
          <OcrApplicationIcon className="h-[104px] w-[104px]" />
          <div className="min-w-0">
            {isVersions ? (
              <NavLink
                className="mb-2 block text-[13px] text-[#1677ff]"
                to={`/applications/${applicationId}`}
              >
                返回应用详情
              </NavLink>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[26px] font-semibold leading-tight text-[#141414]">
                {isDetail
                  ? appName
                  : `${isVersions ? "版本历史" : title} — ${appName}`}
              </h2>
              {isDetail ? <Tag color="magenta">推荐</Tag> : null}
              {!isVersions && !isDelivery ? (
                <Tag color={displayStatus.color}>{displayStatus.label}</Tag>
              ) : null}
              {!isVersions && !isDelivery ? (
                <Tag color="blue">Web 应用</Tag>
              ) : null}
              {isReview ? <Tag color="error">高优先级</Tag> : null}
            </div>
            {!isVersions ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[#697386]">
                <span>
                  当前版本{" "}
                  <strong className="font-medium text-[#1f2937]">v2.4.1</strong>
                </span>
                <i className="h-4 w-px bg-[#d9dfe8]" />
                <span>
                  所属部门{" "}
                  <strong className="font-medium text-[#1f2937]">财务部</strong>
                </span>
                <i className="h-4 w-px bg-[#d9dfe8]" />
                <span>
                  责任人{" "}
                  <strong className="font-medium text-[#1f2937]">李小龙</strong>
                </span>
                <i className="h-4 w-px bg-[#d9dfe8]" />
                <span>
                  维护人{" "}
                  <strong className="font-medium text-[#1f2937]">
                    王芳 / 刘涛
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
                onClick={() => showWarningMessage("编辑功能将在下一版本开放")}
              >
                编辑
              </Button>
              <Button
                danger
                onClick={() => showWarningMessage("下架操作需要发布权限")}
              >
                下架
              </Button>
              <Button
                onClick={() => showWarningMessage("归档操作需要发布权限")}
              >
                归档
              </Button>
              <Button
                onClick={() =>
                  showWarningMessage("责任人移交功能将在下一版本开放")
                }
              >
                移交责任人
              </Button>
            </>
          ) : null}
          {isVersions ? (
            <div className="grid min-w-[390px] grid-cols-4 divide-x divide-[#edf0f5] text-center">
              {[
                ["当前版本", "v2.4.1", "#1f2937"],
                ["已发布", "8", "#16a66a"],
                ["草稿", "1", "#1f2937"],
                ["审核中", "1", "#f59e0b"],
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
                <div className="text-[13px] text-[#697386]">提交时间</div>
                <div className="mt-2 text-[15px] font-semibold text-[#1f2937]">
                  2026-08-01 10:20
                </div>
              </div>
              <div className="px-5">
                <div className="text-[13px] text-[#697386]">提交人</div>
                <div className="mt-2 text-[15px] font-semibold text-[#1f2937]">
                  李小龙
                </div>
              </div>
              <div className="px-5">
                <div className="text-[13px] text-[#697386]">SLA 剩余</div>
                <div className="mt-2 text-[20px] font-semibold text-[#f59e0b]">
                  18h 23m
                </div>
              </div>
            </div>
          ) : null}
          {title === "交付配置" ? (
            <>
              <Button
                onClick={() =>
                  showWarningMessage("预览交付功能将在下一版本开放")
                }
              >
                预览交付
              </Button>
              <Button
                type="primary"
                onClick={() => showWarningMessage("请先保存交付配置")}
              >
                提交审核
              </Button>
            </>
          ) : null}
        </div>
      </section>

      {showNavigation ? <ApplicationNavigation /> : null}

      <span className="sr-only">{description}</span>
      <Alert
        className="sr-only"
        description="数据已通过内部 API 接入；当前界面不提供写操作。"
        showIcon
        title="只读预览"
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
