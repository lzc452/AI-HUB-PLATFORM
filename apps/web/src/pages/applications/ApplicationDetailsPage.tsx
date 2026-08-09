import type { ApplicationStatus } from "@ai-hub/contracts";
import { Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import { MessageError } from "../../shared/ui/message";
import {
  useApplication,
  usePublishedVersion,
} from "../../modules/application/useApplication";

const { Paragraph, Text, Title } = Typography;

const applicationLifecycleStates = [
  { color: "default", label: "草稿" },
  { color: "processing", label: "审核中" },
  { color: "success", label: "已通过" },
  { color: "blue", label: "已上架" },
  { color: "error", label: "已驳回" },
  { color: "warning", label: "已下架" },
  { color: "default", label: "已归档" },
] as const;

const statusLabel: Record<ApplicationStatus, string> = {
  approved: "已通过",
  archived: "已归档",
  draft: "草稿",
  in_review: "审核中",
  published: "已上架",
  withdrawn: "已下架",
};

export default function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } = useApplication(applicationId);
  const publishedVersion = usePublishedVersion(applicationId);

  return (
    <ApplicationAdminPage
      description={`${applicationId ?? "app-001"} 的应用生命周期概览。`}
      title="应用详情"
    >
      <section aria-labelledby="lifecycle-heading" className="space-y-4">
        <Title id="lifecycle-heading" level={2} className="!mb-0">
          生命周期状态
        </Title>
        <div className="flex flex-wrap gap-2" aria-label="应用生命周期状态">
          {applicationLifecycleStates.map((state) => (
            <Tag color={state.color} key={state.label}>
              {state.label}
            </Tag>
          ))}
        </div>
        {isPending ? <Spin aria-label="应用数据加载中" /> : null}
        <MessageError active={isError} cause={error} title="应用数据加载失败" />
        {data ? (
          <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Text type="secondary">当前状态</Text>
                <Title level={5} className="!mb-0 !mt-1">
                  {statusLabel[data.status]}
                </Title>
              </div>
              {publishedVersion.data ? (
                <span className="flex items-center gap-2">
                  <Tag color="blue">当前版本</Tag>
                  <Text type="secondary">v{publishedVersion.data.version}</Text>
                </span>
              ) : null}
            </div>
            <Paragraph className="!mb-0 !mt-4">
              {data.name} · {data.summary}
            </Paragraph>
          </div>
        ) : null}
      </section>
    </ApplicationAdminPage>
  );
}
