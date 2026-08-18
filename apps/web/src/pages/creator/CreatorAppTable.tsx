import { LikeOutlined, PlusOutlined, StarFilled } from "@ant-design/icons";
import { Button, Modal, Select, Skeleton, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ConfirmModal } from "../../components/common/ConfirmModal";
import { EmptyBlock } from "../../components/common/EmptyBlock";
import type {
  CreatorApplicationList,
  CreatorApplicationRecord,
} from "../../modules/application/application.client";
import {
  useDeleteApplication,
  useWithdrawApplication,
  useWithdrawReview,
} from "../../modules/application/useApplication";
import { MessageError } from "../../shared/ui/message";
import {
  formatCount,
  iconGradient,
} from "../../modules/marketplace/catalogMeta";
import {
  creatorSortOptions,
  statusMeta,
  type CreatorSortMode,
} from "./creatorMeta";

const { Text, Title } = Typography;

export interface CreatorAppTableProps {
  data: CreatorApplicationList | undefined;
  error: Error | null;
  isError: boolean;
  isPending: boolean;
}

function formatDate(value: string | null): string {
  return value ? value.slice(0, 10) : "—";
}

/** 创作者应用管理表格：本地筛选/排序，行操作按状态分派。 */
export function CreatorAppTable({
  data,
  error,
  isError,
  isPending,
}: CreatorAppTableProps) {
  const navigate = useNavigate();
  const deleteApplication = useDeleteApplication();
  const handleDelete = (record: CreatorApplicationRecord) => {
    Modal.confirm({
      cancelText: "取消",
      content: `确认删除草稿「${record.name}」？删除后不可恢复。`,
      okText: "确认删除",
      okType: "danger",
      onOk: () => deleteApplication.mutate(record.applicationId),
      title: "删除草稿",
    });
  };
  const withdraw = useWithdrawApplication();
  const withdrawReview = useWithdrawReview();

  const [statusFilter, setStatusFilter] = useState<string>();
  const [categoryFilter, setCategoryFilter] = useState<string>();
  const [tagFilter, setTagFilter] = useState<string>();
  const [sortMode, setSortMode] = useState<CreatorSortMode>("latest");

  const items = data?.items ?? [];

  const statusOptions = useMemo(
    () =>
      [...new Set(items.map((item) => item.status))].map((status) => ({
        label: statusMeta(status).text,
        value: status,
      })),
    [items],
  );
  const categoryOptions = useMemo(
    () =>
      [...new Set(items.map((item) => item.categoryId))]
        .filter(Boolean)
        .map((categoryId) => ({ label: categoryId, value: categoryId })),
    [items],
  );
  const tagOptions = useMemo(
    () =>
      [...new Set(items.flatMap((item) => item.tagIds))].map((tagId) => ({
        label: tagId,
        value: tagId,
      })),
    [items],
  );

  const filteredItems = useMemo(() => {
    let list = items;
    if (statusFilter) {
      list = list.filter((item) => item.status === statusFilter);
    }
    if (categoryFilter) {
      list = list.filter((item) => item.categoryId === categoryFilter);
    }
    if (tagFilter) {
      list = list.filter((item) => item.tagIds.includes(tagFilter));
    }
    return list;
  }, [categoryFilter, items, statusFilter, tagFilter]);

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    if (sortMode === "rating") {
      return list.sort(
        (a, b) => (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0),
      );
    }
    if (sortMode === "popular") {
      return list.sort((a, b) => b.likeCount - a.likeCount);
    }
    return list.sort((a, b) =>
      (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
    );
  }, [filteredItems, sortMode]);

  const columns: TableProps<CreatorApplicationRecord>["columns"] = [
    {
      dataIndex: "name",
      key: "name",
      render: (_: unknown, record) => (
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white"
            style={{ background: iconGradient(record.applicationId) }}
          >
            {record.name.slice(0, 1)}
          </span>
          <Text style={{ color: "#1f1f1f" }}>{record.name}</Text>
        </span>
      ),
      title: "应用名称",
    },
    {
      dataIndex: "publishedAt",
      key: "publishedAt",
      render: (_: unknown, record) => (
        <Text type="secondary">{formatDate(record.publishedAt)}</Text>
      ),
      title: "发布日期",
    },
    {
      dataIndex: "categoryId",
      key: "categoryId",
      render: (_: unknown, record) => (
        <Text type="secondary">{record.categoryId || "未分类"}</Text>
      ),
      title: "分类",
    },
    {
      key: "rating",
      render: (_: unknown, record) =>
        record.ratingAverage === null ? (
          <Text type="secondary">—</Text>
        ) : (
          <span className="flex items-center gap-3 whitespace-nowrap">
            <span className="flex items-center gap-1">
              <StarFilled aria-hidden="true" className="text-[#faad14]" />
              <Text>{record.ratingAverage.toFixed(1)}</Text>
            </span>
            <span className="flex items-center gap-1">
              <LikeOutlined aria-hidden="true" className="text-[#8c8c8c]" />
              <Text type="secondary">{formatCount(record.likeCount)}</Text>
            </span>
          </span>
        ),
      title: "评分/点赞",
    },
    {
      dataIndex: "status",
      key: "status",
      render: (_: unknown, record) => {
        const meta = statusMeta(record.status);
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
      title: "状态",
    },
    {
      key: "actions",
      render: (_: unknown, record) => {
        const withdrawPending =
          withdraw.isPending && withdraw.variables === record.applicationId;
        const detailPath = `/applications/${record.applicationId}`;

        if (record.status === "published") {
          return (
            <span className="flex items-center">
              <Button
                onClick={() => navigate(detailPath)}
                size="small"
                type="link"
              >
                编辑
              </Button>
              <ConfirmModal
                buttonProps={{
                  loading: withdrawPending,
                  size: "small",
                  type: "link",
                }}
                buttonText="下架"
                content="下架后应用将从市场移除，且无法即时恢复上架，确定要下架该应用吗？"
                danger
                okText="确认下架"
                onOk={() => withdraw.mutate(record.applicationId)}
                title="下架应用"
              />
              <Button
                onClick={() => navigate("/analytics")}
                size="small"
                type="link"
              >
                数据
              </Button>
            </span>
          );
        }
        if (record.status === "in_review") {
          const withdrawReviewPending =
            withdrawReview.isPending &&
            withdrawReview.variables === record.pendingVersionId;
          return (
            <span className="flex items-center">
              <Button
                onClick={() => navigate(detailPath)}
                size="small"
                type="link"
              >
                查看
              </Button>
              <ConfirmModal
                buttonProps={{
                  disabled: record.pendingVersionId === null,
                  loading: withdrawReviewPending,
                  size: "small",
                  title:
                    record.pendingVersionId === null
                      ? "暂无待审核版本"
                      : undefined,
                  type: "link",
                }}
                buttonText="撤回"
                content="撤回后该版本将停止审核，可修改后重新提交。"
                okText="确认撤回"
                onOk={() => {
                  if (record.pendingVersionId !== null) {
                    withdrawReview.mutate(record.pendingVersionId);
                  }
                }}
                title="撤回审核"
              />
            </span>
          );
        }
        if (record.status === "draft") {
          return (
            <span className="flex items-center">
              <Button
                onClick={() => navigate(detailPath)}
                size="small"
                type="link"
              >
                查看
              </Button>
              <Button
                onClick={() =>
                  navigate(
                    `/creator/create?type=edit&applicationId=${encodeURIComponent(record.applicationId)}`,
                  )
                }
                size="small"
                type="link"
              >
                继续编辑
              </Button>
              <Button
                danger
                size="small"
                onClick={() => handleDelete(record)}
                type="link"
              >
                删除
              </Button>
            </span>
          );
        }
        return (
          <Button onClick={() => navigate(detailPath)} size="small" type="link">
            查看
          </Button>
        );
      },
      title: "操作",
    },
  ];

  return (
    <section
      aria-label="应用管理"
      className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4"
    >
      <Title level={5} className="!mb-4 !mt-0 !text-base">
        应用管理
      </Title>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white">
        <Select
          allowClear
          aria-label="全部状态"
          className="min-w-32"
          onChange={(value?: string) => setStatusFilter(value)}
          options={statusOptions}
          placeholder="全部状态"
          value={statusFilter}
        />
        <Select
          allowClear
          aria-label="全部类型"
          className="min-w-32"
          onChange={(value?: string) => setCategoryFilter(value)}
          options={categoryOptions}
          placeholder="全部类型"
          value={categoryFilter}
        />
        <Select
          allowClear
          aria-label="全部标签"
          className="min-w-32"
          onChange={(value?: string) => setTagFilter(value)}
          options={tagOptions}
          placeholder="全部标签"
          value={tagFilter}
        />
        <Select
          aria-label="排序方式"
          className="min-w-32"
          onChange={(value: CreatorSortMode) => setSortMode(value)}
          options={[...creatorSortOptions]}
          value={sortMode}
        />
        {data && items.length === 0 ? null : (
          <Button
            className="ml-auto"
            icon={<PlusOutlined aria-hidden="true" />}
            onClick={() => navigate("/applications")}
            type="primary"
          >
            创建新应用
          </Button>
        )}
      </div>

      {isPending ? <Skeleton active paragraph={{ rows: 6 }} /> : null}
      <MessageError active={isError} cause={error} title="应用列表加载失败" />
      {data && items.length === 0 ? (
        <EmptyBlock
          action={
            <Button
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={() => navigate("/applications")}
              type="primary"
            >
              创建新应用
            </Button>
          }
          description="您还没有创建任何应用"
        />
      ) : null}
      {data && items.length > 0 && sortedItems.length === 0 ? (
        <EmptyBlock description="没有符合条件的应用" />
      ) : null}
      {data && sortedItems.length > 0 ? (
        <Table<CreatorApplicationRecord>
          columns={columns}
          dataSource={sortedItems}
          pagination={false}
          rowKey="applicationId"
          scroll={{ x: 720 }}
          size="middle"
        />
      ) : null}
    </section>
  );
}
