import { Alert, Empty, Input, Spin, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import { useApplication } from "../../modules/application/useApplication";

const { Text, Title } = Typography;

export default function ApplicationsPage() {
  const [lookupId, setLookupId] = useState("");
  const { data, error, isError, isFetching } = useApplication(
    lookupId || undefined,
  );

  return (
    <ApplicationAdminPage
      description="Review application records, immutable versions, review history, and delivery configuration from one administration surface."
      title="Applications"
    >
      <section
        aria-labelledby="application-directory-heading"
        className="space-y-4"
      >
        <Title id="application-directory-heading" level={2} className="!mb-0">
          Application directory
        </Title>
        <Input.Search
          aria-label="应用 ID"
          enterButton="查询"
          onSearch={setLookupId}
          placeholder="输入应用 ID 查看管理信息"
        />
        {isFetching ? <Spin aria-label="应用信息加载中" /> : null}
        {isError ? (
          <Alert
            description={error.message}
            showIcon
            title="应用信息加载失败"
            type="error"
          />
        ) : null}
        {!lookupId ? (
          <Empty description="输入应用 ID 查看应用管理信息" />
        ) : null}
        {data ? (
          <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Title level={3} className="!mb-0">
                  {data.name}
                </Title>
                <Text type="secondary">
                  {data.applicationId} · owned by {data.ownerEmployeeId}
                </Text>
              </div>
              <Tag color="blue">{data.status}</Tag>
            </div>
            <div className="mt-4">
              <Link to={`/applications/${data.applicationId}`}>
                Open application details
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </ApplicationAdminPage>
  );
}
