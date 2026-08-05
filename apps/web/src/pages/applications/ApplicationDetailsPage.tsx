import type { ApplicationStatus } from "@ai-hub/contracts";
import { Alert, Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import {
  useApplication,
  usePublishedVersion,
} from "../../modules/application/useApplication";

const { Paragraph, Text, Title } = Typography;

const applicationLifecycleStates = [
  { color: "default", label: "Draft" },
  { color: "processing", label: "In review" },
  { color: "success", label: "Approved" },
  { color: "blue", label: "Published" },
  { color: "error", label: "Rejected" },
  { color: "warning", label: "Withdrawn" },
  { color: "default", label: "Archived" },
] as const;

const statusLabel: Record<ApplicationStatus, string> = {
  approved: "Approved",
  archived: "Archived",
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  withdrawn: "Withdrawn",
};

export default function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } = useApplication(applicationId);
  const publishedVersion = usePublishedVersion(applicationId);

  return (
    <ApplicationAdminPage
      description={`Lifecycle overview for ${applicationId ?? "app-001"}.`}
      title="Application details"
    >
      <section aria-labelledby="lifecycle-heading" className="space-y-4">
        <Title id="lifecycle-heading" level={2} className="!mb-0">
          Lifecycle states
        </Title>
        <div
          className="flex flex-wrap gap-2"
          aria-label="Application lifecycle states"
        >
          {applicationLifecycleStates.map((state) => (
            <Tag color={state.color} key={state.label}>
              {state.label}
            </Tag>
          ))}
        </div>
        {isPending ? <Spin aria-label="应用数据加载中" /> : null}
        {isError ? (
          <Alert
            description={error.message}
            showIcon
            title="应用数据加载失败"
            type="error"
          />
        ) : null}
        {data ? (
          <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Text type="secondary">Current state</Text>
                <Title level={3} className="!mb-0 !mt-1">
                  {statusLabel[data.status]}
                </Title>
              </div>
              {publishedVersion.data ? (
                <span className="flex items-center gap-2">
                  <Tag color="blue">Published version</Tag>
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
