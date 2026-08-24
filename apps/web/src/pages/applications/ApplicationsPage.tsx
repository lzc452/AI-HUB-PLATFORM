import { Modal } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  MessageError,
  showErrorMessage,
  showSuccessMessage,
} from "../../shared/ui/message";
import {
  type AdminApplicationFilterMode,
  type AdminApplicationStatus,
  type AdminKpiCards,
  type AdminKpiMeta,
} from "../../modules/application/adminListMeta";
import { channelText } from "../../modules/marketplace/catalogMeta";
import { useAdminApplicationList } from "../../modules/application/useAdminApplicationList";
import { useAdminKpis } from "../../modules/application/useAdminKpis";
import { publishApplication } from "../../modules/application/application.client";
import { useDeleteApplication } from "../../modules/application/useApplication";
import { useAuth } from "../../modules/auth/useAuth";
import { hasPermission } from "../../modules/auth/roles";
import { ROUTES } from "../../router/routes";

import { ApplicationAdminHero } from "./ApplicationAdminHero";
import { ApplicationAdminKpiCards } from "./ApplicationAdminKpiCards";
import {
  ApplicationAdminFilters,
  type FilterOption,
  type SortOption,
  defaultStatusFilterOptions,
} from "./ApplicationAdminFilters";
import {
  ApplicationAdminTable,
  type ApplicationRowAction,
} from "./ApplicationAdminTable";
import { ApplicationAdminPagination } from "./ApplicationAdminPagination";
import type { AdminApplicationRow } from "../../modules/application/adminListMeta";

const KPI_ACCENTS = {
  total: {
    accent: "#1d4ed8",
    background: "#f0f7ff",
    border: "#d6e4ff",
    hint: "所有应用总量",
    iconBackground: "#e6f4ff",
    iconColor: "#1677ff",
    label: "应用总数",
  },
  pendingReview: {
    accent: "#ad6800",
    background: "#fff7e6",
    border: "#ffe7ba",
    hint: "待审核应用数量",
    iconBackground: "#fff1cc",
    iconColor: "#d48806",
    label: "待审核",
  },
  published: {
    accent: "#237804",
    background: "#f6ffed",
    border: "#b7eb8f",
    hint: "已上架应用数量",
    iconBackground: "#d9f7be",
    iconColor: "#389e0d",
    label: "已上架",
  },
  deliveryFailed: {
    accent: "#cf1322",
    background: "#fff1f0",
    border: "#ffccc7",
    hint: "交付异常应用数量",
    iconBackground: "#ffe3e0",
    iconColor: "#f5222d",
    label: "交付异常",
  },
} as const satisfies Record<keyof AdminKpiCards, Omit<AdminKpiMeta, "value">>;

/**
 * 应用管理主页：Hero + KPI + 筛选 + 表格 + 分页。
 * - 视觉与 marketplace 保持节奏一致：白底卡片、浅色边框、统一圆角 (rounded-2xl)。
 * - 状态/筛选/分页全部本地维护，路由不参与。
 * - 行操作通过 Modal.confirm 二次确认；错误通过 MessageError 弹窗提示。
 */
export default function ApplicationsPage() {
  const list = useAdminApplicationList({ pageSize: 10 });
  const kpisQuery = useAdminKpis();
  const deleteApplication = useDeleteApplication();
  const { actor } = useAuth();
  // 审核入口（待审核 KPI / 待我审核筛选 / 行审核按钮）仅对具备审核权限的角色可见。
  const canReview = hasPermission(actor, "application.review");
  const [pendingAction, setPendingAction] = useState<{
    action: ApplicationRowAction;
    row: AdminApplicationRow;
  } | null>(null);
  const navigate = useNavigate();

  // KPI 与 Tab 计数由独立的摘要接口提供，与列表筛选/分页完全解耦。
  const kpiNumbers = kpisQuery.data ?? {
    deliveryFailed: 0,
    pendingReview: 0,
    published: 0,
    total: 0,
  };

  const kpiCards: AdminKpiCards = useMemo(
    () => ({
      total: { ...KPI_ACCENTS.total, value: kpiNumbers.total },
      pendingReview: {
        ...KPI_ACCENTS.pendingReview,
        value: kpiNumbers.pendingReview,
      },
      published: { ...KPI_ACCENTS.published, value: kpiNumbers.published },
      deliveryFailed: {
        ...KPI_ACCENTS.deliveryFailed,
        value: kpiNumbers.deliveryFailed,
      },
    }),
    [kpiNumbers],
  );

  const countByMode = useMemo<Record<AdminApplicationFilterMode, number>>(
    () => ({
      all: kpiNumbers.total,
      owned: list.data?.items.filter((item) => item.isMine).length ?? 0,
      review: canReview ? kpiNumbers.pendingReview : 0,
    }),
    [kpiNumbers.total, kpiNumbers.pendingReview, canReview],
  );

  // 行操作点击：先弹出确认弹窗，关闭后清空待办状态。
  useEffect(() => {
    if (!pendingAction) {
      return;
    }
    const { action, row } = pendingAction;
    const plan = describeAction(action, row);
    const modal = Modal.confirm({
      cancelText: "取消",
      content: plan.content,
      okText: plan.okText,
      okType: plan.danger ? "danger" : "primary",
      onCancel: () => {
        modal.destroy();
        setPendingAction(null);
      },
      onOk: async () => {
        // 语义接线：review 走审核工作台；edit 走创作者中心；publish 调真实发布接口。
        if (action === "review" && row.currentVersionId) {
          navigate(
            `/applications/${encodeURIComponent(row.applicationId)}/review`,
          );
          return;
        }
        if (action === "edit") {
          navigate(
            `/creator/create?type=edit&applicationId=${encodeURIComponent(row.applicationId)}`,
          );
          return;
        }
        if (action === "view") {
          navigate(`/applications/${encodeURIComponent(row.applicationId)}`);
          return;
        }
        if (action === "version") {
          navigate(
            `/applications/${encodeURIComponent(row.applicationId)}/versions`,
          );
          return;
        }
        if (action === "publish" && row.currentVersionId) {
          await publishApplication(row.applicationId, row.currentVersionId);
          showSuccessMessage(plan.success);
          list.refetch();
          return;
        }
        if (action === "delete") {
          // 先清空待办，避免 mutation 状态翻转引发的重渲染让 effect 再次弹出确认框。
          setPendingAction(null);
          deleteApplication.mutate(row.applicationId);
          modal.destroy();
          return;
        }
        // republish：V1 后端无对应状态机入口，明确提示，不伪装成功。
        showErrorMessage(new Error(plan.content), "操作不可用");
        modal.destroy();
      },
      title: plan.title,
    });
  }, [pendingAction]);

  const handleCreate = () => {
    navigate(ROUTES.creatorCreate);
  };

  return (
    <div className="space-y-4">
      <ApplicationAdminHero
        description="统一管理应用发布、版本、审核与交付配置。"
        onCreate={handleCreate}
        title="应用管理"
      />

      <ApplicationAdminKpiCards
        canReview={canReview}
        cards={kpiCards}
        isLoading={kpisQuery.isPending}
      />

      <ApplicationAdminFilters
        applicationType={list.filters.applicationType}
        applicationTypeOptions={APPLICATION_TYPE_OPTIONS}
        channel={list.filters.channel}
        channelOptions={CHANNEL_OPTIONS}
        countByMode={countByMode}
        departmentId={list.filters.departmentId}
        departmentOptions={DEPARTMENT_OPTIONS}
        isLoading={list.isFetching && list.data === undefined}
        keyword={list.keyword}
        mode={list.filters.mode}
        onApplicationTypeChange={list.filters.setApplicationType}
        onChannelChange={list.filters.setChannel}
        onDepartmentChange={list.filters.setDepartmentId}
        onKeywordChange={list.setKeyword}
        onModeChange={list.filters.setMode}
        onReset={list.filters.reset}
        onSortChange={(value: SortOption) => list.filters.setSort(value)}
        onStatusChange={list.filters.setStatus}
        sort={list.filters.sort}
        status={list.filters.status}
        statusOptions={defaultStatusFilterOptions}
        showReviewMode={canReview}
      />

      <MessageError
        active={list.isError}
        cause={list.error}
        title="应用列表加载失败"
      />

      <div className="space-y-0">
        <ApplicationAdminTable
          canReview={canReview}
          isError={list.isError}
          isLoading={list.isPending && list.data === undefined}
          onAction={(action, row) => setPendingAction({ action, row })}
          rows={list.data?.items ?? []}
        />
        {list.data ? (
          <ApplicationAdminPagination
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            page={list.page}
            pageSize={list.pageSize}
            total={list.data.total}
          />
        ) : null}
      </div>
    </div>
  );
}

interface ActionPlan {
  content: string;
  danger: boolean;
  okText: string;
  success: string;
  title: string;
}

function describeAction(
  action: ApplicationRowAction,
  row: AdminApplicationRow,
): ActionPlan {
  const name = row.name ?? "未命名应用";
  switch (action) {
    case "delete":
      return {
        content: `确认删除草稿「${name}」？删除后不可恢复。`,
        danger: true,
        okText: "确认删除",
        success: "应用已删除",
        title: "删除草稿",
      };
    case "edit":
      return {
        content: `继续编辑「${name}」？将跳转到创作者中心。`,
        danger: false,
        okText: "继续编辑",
        success: "已为你打开编辑视图",
        title: "继续编辑",
      };
    case "republish":
      return {
        content: `「${name}」已下架。重新发布需重新提交审核并走发布流程，请在应用工作台中操作。`,
        danger: false,
        okText: "知道了",
        success: "",
        title: "重新发布",
      };
    case "publish":
      return {
        content: `确认将「${name}」发布到市场？发布后所有目标受众可见。`,
        danger: false,
        okText: "确认发布",
        success: "应用已发布到市场",
        title: "发布应用",
      };
    case "review":
      return {
        content: `开始审核「${name}」当前版本 ${row.currentVersion}？`,
        danger: false,
        okText: "开始审核",
        success: "已进入审核工作台",
        title: "审核申请",
      };
    case "version":
      return {
        content: `查看「${name}」的全部版本记录？`,
        danger: false,
        okText: "查看版本",
        success: "已加载版本历史",
        title: "查看版本",
      };
    case "view":
    default:
      return {
        content: `查看「${name}」的完整管理信息？`,
        danger: false,
        okText: "查看",
        success: "正在打开应用详情",
        title: "查看应用",
      };
  }
}

const DEPARTMENT_OPTIONS: ReadonlyArray<FilterOption> = [
  { label: "研发部", value: "研发部" },
  { label: "法务部", value: "法务部" },
  { label: "供应链中心", value: "供应链中心" },
  { label: "销售部", value: "销售部" },
  { label: "制造中心", value: "制造中心" },
  { label: "财务部", value: "财务部" },
  { label: "人力资源部", value: "人力资源部" },
  { label: "客户成功部", value: "客户成功部" },
  { label: "市场部", value: "市场部" },
  { label: "信息技术部", value: "信息技术部" },
];

const APPLICATION_TYPE_OPTIONS: ReadonlyArray<FilterOption> = [
  { label: "研发提效", value: "研发提效" },
  { label: "法务合规", value: "法务合规" },
  { label: "运营提效", value: "运营提效" },
  { label: "行政办公", value: "行政办公" },
  { label: "生产制造", value: "生产制造" },
  { label: "财务税务", value: "财务税务" },
  { label: "人事行政", value: "人事行政" },
  { label: "客户服务", value: "客户服务" },
  { label: "市场增长", value: "市场增长" },
  { label: "知识管理", value: "知识管理" },
  { label: "采购供应链", value: "采购供应链" },
  { label: "质量管理", value: "质量管理" },
];

const CHANNEL_OPTIONS: ReadonlyArray<FilterOption> = (
  Object.keys(channelText) as Array<keyof typeof channelText>
).map((key) => ({ label: channelText[key], value: key }));

// 仅保留类型导出，避免其它模块出现未使用导入。
export type { AdminApplicationStatus };
