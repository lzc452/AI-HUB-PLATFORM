import type { DemandAudienceType, DemandStatus } from "@ai-hub/contracts";
import { PERMISSIONS } from "@ai-hub/contracts";
import {
  Button,
  Card,
  Input,
  Pagination,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  ClockCircleOutlined,
  CommentOutlined,
  LikeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StarFilled,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyBlock } from "../../components/common/EmptyBlock";
import { useActor, useDepartments } from "../../modules/auth/useIdentity";
import { hasPermission } from "../../modules/auth/roles";
import { demandAudienceText, demandStatusColor, demandStatusText } from "../../modules/innovation/demandMeta";
import { type DemandListQuery, type DemandSort } from "../../modules/innovation/demand.client";
import { useDemandList } from "../../modules/innovation/useDemand";
import { MessageError } from "../../shared/ui/message";
import { CreateDemandDrawer } from "./CreateDemandDrawer";
import type { DemandView } from "./innovation.types";

const PAGE_SIZE = 6;
const statusOptions: { label: string; value: DemandStatus }[] = [
  { label: "全部状态", value: "published" },
  { label: "待审核", value: "pending_review" },
  { label: "进行中", value: "in_progress" },
  { label: "试点中", value: "pilot" },
  { label: "已完成", value: "completed" },
];

function dateText(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function DemandCard({ demand, departmentName }: { demand: DemandView; departmentName?: string }) {
  const audience = demand.displayAnonymously
    ? "匿名展示"
    : demandAudienceText[demand.audienceType] ?? "受众已过滤";
  return (
    <Link
      aria-label="查看需求详情"
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]"
      to={`/innovation/${demand.demandId}`}
    >
      <Card className="h-full border-[#e5e7eb] transition hover:-translate-y-0.5 hover:border-[#91caff] hover:shadow-[0_12px_30px_rgba(22,119,255,0.1)]" bodyStyle={{ padding: 20 }}>
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Tag color={demandStatusColor[demand.status]}>{demandStatusText[demand.status]}</Tag>
                <Typography.Text className="text-xs" type="secondary">{departmentName ?? demand.requesterDepartmentName ?? "未标注部门"}</Typography.Text>
              </div>
              <Typography.Title className="!mb-0 !text-lg" ellipsis={{ rows: 2 }} level={4}>{demand.title}</Typography.Title>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs text-[#8c8c8c]"><span>{audience}</span></div>
          </div>
          <Typography.Paragraph className="!mb-0 min-h-12 text-sm leading-6 text-[#595959]" ellipsis={{ rows: 2 }}>{demand.problemStatement}</Typography.Paragraph>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f7faff] p-3 text-center text-xs">
            <div><div className="font-semibold text-[#1677ff]">{demand.businessValue ?? "—"}</div><div className="text-[#8c8c8c]">价值</div></div>
            <div><div className="font-semibold text-[#595959]">{demand.implementationCost ?? "—"}</div><div className="text-[#8c8c8c]">成本</div></div>
            <div><div className="font-semibold text-[#ff7a45]">{demand.riskLevel ?? "—"}</div><div className="text-[#8c8c8c]">风险</div></div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-3">
            <div className="flex items-center gap-3 text-xs text-[#8c8c8c]">
              <span className="inline-flex items-center gap-1"><LikeOutlined />{demand.likeCount}</span>
              <span className="inline-flex items-center gap-1"><CommentOutlined />{demand.commentCount}</span>
              <span className="inline-flex items-center gap-1"><ClockCircleOutlined />{dateText(demand.updatedAt)}</span>
            </div>
            {demand.priorityScore !== null && demand.priorityScore !== undefined ? <span className="inline-flex items-center gap-1 font-semibold text-[#faad14]"><StarFilled />{demand.priorityScore.toFixed(1)}</span> : null}
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
  const status = (searchParams.get("status") as DemandStatus | null) ?? undefined;
  const department = searchParams.get("department") ?? undefined;
  const audience = (searchParams.get("audience") as DemandAudienceType | null) ?? undefined;
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
  const departmentNames = useMemo(() => new Map((departments.data ?? []).map((item) => [item.departmentId, item.name])), [departments.data]);

  const updateParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if ("q" in changes || "status" in changes || "department" in changes || "audience" in changes || "sort" in changes) next.delete("page");
    setSearchParams(next);
  };

  const resetFilters = () => setSearchParams({});
  const canCreate = hasPermission(actor.data ?? null, PERMISSIONS.DEMAND_CREATE);

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-[#d6e4ff] bg-[#eaf4ff] px-5 py-6 sm:flex-row sm:items-center lg:px-8 lg:py-8">
        <div><Typography.Title className="!mb-2 !text-3xl lg:!text-4xl" level={1}>创新广场</Typography.Title><Typography.Paragraph className="!mb-0 text-[#595959]">结构化需求与受众治理 · 把真实业务问题变成可协作、可推进的创新需求</Typography.Paragraph></div>
        {canCreate ? <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} size="large" type="primary">发起新需求</Button> : null}
      </section>

      <section aria-label="需求筛选" className="rounded-2xl border border-[#edf0f5] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Input.Search aria-label="搜索需求" className="min-w-[240px] flex-1" defaultValue={query} onSearch={(value) => updateParams({ q: value || undefined })} placeholder="搜索需求标题或问题描述" />
          <Select allowClear aria-label="需求状态" className="min-w-32" onChange={(value) => updateParams({ status: value })} options={statusOptions} placeholder="全部状态" value={status} />
          <Select allowClear aria-label="所属部门" className="min-w-40" onChange={(value) => updateParams({ department: value })} options={(departments.data ?? []).map((item) => ({ label: item.name, value: item.departmentId }))} placeholder="所属部门" showSearch value={department} />
          <Select allowClear aria-label="可见范围" className="min-w-32" onChange={(value) => updateParams({ audience: value })} options={[{ label: "全员可见", value: "all" }, { label: "部门可见", value: "department" }, { label: "指定员工", value: "employee" }]} placeholder="可见范围" value={audience} />
          <Select aria-label="需求排序" className="min-w-32" onChange={(value: DemandSort) => updateParams({ sort: value })} options={[{ label: "最新更新", value: "recent" }, { label: "优先级", value: "priority" }, { label: "最热门", value: "hot" }]} value={sort} />
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>重置</Button>
        </div>
      </section>

      <section aria-labelledby="innovation-demand-list" className="space-y-4">
        <div className="flex items-center justify-between"><div><Typography.Title id="innovation-demand-list" className="!mb-1" level={2}>可见需求</Typography.Title><Typography.Text type="secondary">共 {data?.total ?? 0} 条需求</Typography.Text></div><Typography.Text type="secondary">每页 {PAGE_SIZE} 条</Typography.Text></div>
        {isPending ? <div className="flex justify-center py-16"><Spin aria-label="需求列表加载中" /></div> : null}
        <MessageError active={isError} cause={error} title="需求列表加载失败" />
        {data && data.items.length === 0 ? <EmptyBlock description="当前筛选条件下没有可见需求" /> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.items ?? []).map((entry) => {
            const view = entry as DemandView;
            const departmentName = departmentNames.get(view.requesterDepartmentId ?? "");
            return <DemandCard {...(departmentName ? { departmentName } : {})} demand={view} key={entry.demandId} />;
          })}
        </div>
        {data && data.total > PAGE_SIZE ? <div className="flex justify-center pt-2"><Pagination current={page} onChange={(nextPage) => updateParams({ page: String(nextPage) })} pageSize={PAGE_SIZE} showSizeChanger={false} total={data.total} /></div> : null}
      </section>
      <CreateDemandDrawer onClose={() => setCreateOpen(false)} open={createOpen} />
    </div>
  );
}
