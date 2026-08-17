import type { DemandAudienceType, DemandStatus } from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Button,
  Card,
  Input,
  Pagination,
  Rate,
  Segmented,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  CommentOutlined,
  GlobalOutlined,
  HeartOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyBlock } from "../../components/common/EmptyBlock";
import { useActor, useDepartments } from "../../modules/auth/useIdentity";
import { hasPermission } from "../../modules/auth/roles";
import {
  demandAudienceText,
  demandStatusColor,
  demandStatusText,
} from "../../modules/innovation/demandMeta";
import {
  type DemandListQuery,
  type DemandSort,
} from "../../modules/innovation/demand.client";
import { useDemandList } from "../../modules/innovation/useDemand";
import { MessageError } from "../../shared/ui/message";
import { CreateDemandDrawer } from "./CreateDemandDrawer";
import type { DemandView } from "./innovation.types";

const PAGE_SIZE = 6;

const statusOptions: { label: string; value: DemandStatus }[] = [
  { label: "待审核", value: "pending_review" },
  { label: "待认领", value: "pending_claim" },
  { label: "已认领", value: "claimed" },
  { label: "方案验证中", value: "validating" },
  { label: "试点中", value: "pilot" },
  { label: "已转化为应用", value: "converted" },
];

const audienceOptions: { label: string; value: DemandAudienceType }[] = [
  { label: "全员可见", value: "all" },
  { label: "部门可见", value: "department" },
  { label: "指定员工", value: "employee" },
];

const sortItems = [
  { key: "recent", label: "最新" },
  { key: "priority", label: "优先级" },
  { key: "hot", label: "热度" },
];

const sortLabel: Record<DemandSort, string> = {
  hot: "热度",
  priority: "优先级",
  recent: "最新",
};

function dateText(value: string) {
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function AudienceIcon({
  audienceType,
  displayAnonymously,
}: {
  audienceType: DemandAudienceType;
  displayAnonymously: boolean;
}) {
  if (displayAnonymously) return <LockOutlined />;
  if (audienceType === "all") return <GlobalOutlined />;
  if (audienceType === "department") return <TeamOutlined />;
  return <UserOutlined />;
}

function MetricDots({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value?: number | null | undefined;
}) {
  if (value === null || value === undefined) {
    return (
      <div>
        <Typography.Text className="text-xs text-[#8c8c8c]">
          {label}
        </Typography.Text>
        <div className="text-xs font-semibold text-[#8c8c8c]">—</div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-1">
        <Typography.Text className="text-xs text-[#8c8c8c]">
          {label}
        </Typography.Text>
        <Typography.Text className="text-xs font-semibold" style={{ color }}>
          {value}
        </Typography.Text>
      </div>
      <Rate
        character="●"
        className="!text-[10px] leading-none"
        count={5}
        disabled
        style={{
          ["--ant-rate-star-color" as string]: color,
          ["--ant-rate-star-bg" as string]: "#f0f0f0",
        }}
        value={value}
      />
    </div>
  );
}

function DemandCard({
  demand,
  departmentName,
}: {
  demand: DemandView;
  departmentName?: string;
}) {
  const audience = demand.displayAnonymously
    ? "匿名发布"
    : (demandAudienceText[demand.audienceType] ?? "受众已过滤");
  return (
    <Link
      aria-label="查看需求详情"
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]"
      to={`/innovation/${demand.demandId}`}
    >
      <Card
        className="h-full border-[#d9d9d9] transition hover:-translate-y-0.5 hover:border-[#91caff] hover:shadow-[0_12px_30px_rgba(22,119,255,0.1)]"
        styles={{ body: { padding: 20 } }}
      >
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={demandStatusColor[demand.status]}>
                {demandStatusText[demand.status]}
              </Tag>
              <Typography.Text className="text-xs" type="secondary">
                {departmentName ??
                  demand.requesterDepartmentName ??
                  "未标注部门"}
              </Typography.Text>
              <Typography.Text
                className="inline-flex items-center gap-1 text-xs"
                type="secondary"
              >
                <AudienceIcon
                  audienceType={demand.audienceType}
                  displayAnonymously={demand.displayAnonymously}
                />
                {audience}
              </Typography.Text>
            </div>
            <RightOutlined className="mt-0.5 text-xs text-[#bfbfbf]" />
          </div>

          <Typography.Title
            className="!mb-0 !text-base"
            ellipsis={{ rows: 2 }}
            level={4}
          >
            {demand.title}
          </Typography.Title>

          <Typography.Paragraph
            className="!mb-0 min-h-10 text-sm leading-6 text-[#595959]"
            ellipsis={{ rows: 2 }}
          >
            {demand.problemStatement}
          </Typography.Paragraph>

          <div className="flex items-end justify-between gap-2 rounded-xl bg-[#f7faff] p-3">
            <div className="flex gap-4">
              <MetricDots
                color="#1677ff"
                label="业务价值"
                value={demand.businessValue}
              />
              <MetricDots
                color="#8c8c8c"
                label="实施成本"
                value={demand.implementationCost}
              />
              <MetricDots
                color="#ff7a45"
                label="数据合规风险"
                value={demand.dataComplianceRisk}
              />
            </div>
            {demand.priorityScore !== null &&
            demand.priorityScore !== undefined ? (
              <div className="text-right">
                <Typography.Text className="block text-xs text-[#8c8c8c]">
                  优先级评分
                </Typography.Text>
                <Typography.Text className="text-lg font-semibold text-[#d48806]">
                  {demand.priorityScore.toFixed(1)}
                </Typography.Text>
              </div>
            ) : null}
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-3">
            <Typography.Text className="text-xs" type="secondary">
              更新于 {dateText(demand.updatedAt)}
            </Typography.Text>
            <div className="flex items-center gap-4 text-xs text-[#8c8c8c]">
              <span className="inline-flex items-center gap-1">
                <HeartOutlined />
                {demand.likeCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <CommentOutlined />
                {demand.commentCount}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function InnovationSquarePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const actor = useActor();
  const departments = useDepartments();
  const [createOpen, setCreateOpen] = useState(false);
  const query = searchParams.get("q") ?? "";
  const status =
    (searchParams.get("status") as DemandStatus | null) ?? undefined;
  const department = searchParams.get("department") ?? undefined;
  const audience =
    (searchParams.get("audience") as DemandAudienceType | null) ?? undefined;
  const sort = (searchParams.get("sort") as DemandSort | null) ?? "recent";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const requestQuery: DemandListQuery = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(audience ? { audienceType: audience } : {}),
      ...(query ? { query } : {}),
      ...(department ? { requesterDepartmentId: department } : {}),
      ...(sort ? { sort } : {}),
      ...(status ? { status } : {}),
    }),
    [audience, department, page, query, sort, status],
  );
  const { data, error, isError, isPending } = useDemandList(requestQuery);
  const departmentNames = useMemo(
    () =>
      new Map(
        (departments.data ?? []).map((item) => [item.departmentId, item.name]),
      ),
    [departments.data],
  );

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (
      "q" in changes ||
      "status" in changes ||
      "department" in changes ||
      "audience" in changes ||
      "sort" in changes
    )
      next.delete("page");
    setSearchParams(next);
  };

  const resetFilters = () => setSearchParams({});
  const canCreate = hasPermission(
    actor.data ?? null,
    PERMISSIONS.DEMAND_CREATE,
  );

  return (
    <div className="space-y-4">
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-[#d6e4ff] bg-[#eaf4ff] p-4 sm:flex-row sm:items-center">
        <div>
          
          <div className="flex items-baseline gap-2">
            <Typography.Title className="!mb-2 !mt-0" level={1}>
              创新广场
            </Typography.Title>
            <Typography.Text id="innovation-demand-list" type="secondary">
              共 {data?.total ?? 0} 个公开需求
            </Typography.Text>
          </div>
          <Typography.Paragraph className="!mb-0 text-[#595959]">
            结构化需求与受众治理 · 把真实业务问题变成可协作、可推进的创新需求
          </Typography.Paragraph>
        </div>
        {canCreate ? (
          <Button
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
            size="large"
            type="primary"
          >
            发起新需求
          </Button>
        ) : null}
      </section>

      <Card className="border-[#d9d9d9]" styles={{ body: { padding: 16 } }}>
        <div className="flex flex-wrap items-center gap-3">
          <Input.Search
            aria-label="搜索需求"
            className="min-w-[240px] flex-1"
            defaultValue={query}
            onSearch={(value) => updateParams({ q: value || undefined })}
            placeholder="搜索需求标题或问题描述"
          />
          <Select
            allowClear
            aria-label="需求状态"
            className="min-w-32"
            onChange={(value) => updateParams({ status: value })}
            options={statusOptions}
            placeholder="全部状态"
            value={status}
          />
          <Select
            allowClear
            aria-label="所属部门"
            className="min-w-40"
            onChange={(value) => updateParams({ department: value })}
            options={(departments.data ?? []).map((item) => ({
              label: item.name,
              value: item.departmentId,
            }))}
            placeholder="所属部门"
            showSearch
            value={department}
          />
          <Select
            allowClear
            aria-label="可见范围"
            className="min-w-32"
            onChange={(value) => updateParams({ audience: value })}
            options={audienceOptions}
            placeholder="全部范围"
            value={audience}
          />
          <Segmented
            className="!mb-0"
            onChange={(value) => updateParams({ sort: value as DemandSort })}
            options={sortItems.map((item) => ({
              label: item.label,
              value: item.key,
            }))}
            size="small"
            value={sort}
          />
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>
            重置
          </Button>
        </div>
      </Card>

      <section aria-labelledby="innovation-demand-list" className="space-y-4 mt-4">
        {isPending ? (
          <div className="flex justify-center py-16">
            <Spin aria-label="需求列表加载中" />
          </div>
        ) : null}
        <MessageError active={isError} cause={error} title="需求列表加载失败" />
        {data && data.items.length === 0 ? (
          <EmptyBlock description="当前筛选条件下没有可见需求" />
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.items ?? []).map((entry) => {
            const view = entry as DemandView;
            const departmentName = departmentNames.get(
              view.requesterDepartmentId ?? "",
            );
            return (
              <DemandCard
                {...(departmentName ? { departmentName } : {})}
                demand={view}
                key={entry.demandId}
              />
            );
          })}
        </div>
        {data && data.total > PAGE_SIZE ? (
          <div className="flex justify-center pt-2">
            <Pagination
              current={page}
              onChange={(nextPage) => updateParams({ page: String(nextPage) })}
              pageSize={PAGE_SIZE}
              showSizeChanger={false}
              total={data.total}
            />
          </div>
        ) : null}
      </section>
      <CreateDemandDrawer
        onClose={() => setCreateOpen(false)}
        open={createOpen}
      />
    </div>
  );
}
