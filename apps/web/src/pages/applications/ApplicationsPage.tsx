import { Empty, Input, Spin, Tag, Typography } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import { MessageError } from "../../shared/ui/message";
import { useApplication } from "../../modules/application/useApplication";

const { Text, Title } = Typography;

export default function ApplicationsPage() {
  const [lookupId, setLookupId] = useState("");
  const { data, error, isError, isFetching } = useApplication(
    lookupId || undefined,
  );

  return (
    <ApplicationAdminPage
      description="统一管理应用发布、版本、审核与交付配置。"
      title="应用管理"
    >
      <section
        aria-labelledby="application-directory-heading"
        className="space-y-4"
      >
        <Title id="application-directory-heading" level={2} className="!mb-0">
          应用目录
        </Title>
        <Input.Search
          aria-label="应用 ID"
          enterButton="查询"
          onSearch={setLookupId}
          placeholder="输入应用 ID 查看管理信息"
        />
        {isFetching ? <Spin aria-label="应用信息加载中" /> : null}
        <MessageError
          active={isError}
          cause={error}
          title="应用信息加载失败"
        />
        {!lookupId ? (
          <Empty description="输入应用 ID 查看应用管理信息" />
        ) : null}
        {data ? (
          <div className="rounded-md border border-solid border-[#d9d9d9] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Title level={5} className="!mb-0 !mt-0">
                  {data.name}
                </Title>
                <Text type="secondary">
                  {data.applicationId} · 负责人 {data.ownerEmployeeId}
                </Text>
              </div>
              <Tag color="blue">{data.status}</Tag>
            </div>
            <div className="mt-4">
              <Link to={`/applications/${data.applicationId}`}>
                查看应用详情
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </ApplicationAdminPage>
  );
}
