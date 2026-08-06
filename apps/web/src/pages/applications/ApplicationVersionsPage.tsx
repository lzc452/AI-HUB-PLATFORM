import { Alert, Empty, Spin, Tag, Typography } from "antd";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import type { ApplicationVersionRecord } from "../../modules/application/application.client";
import {
  useApplicationVersions,
  usePublishedVersion,
} from "../../modules/application/useApplication";

const { Paragraph, Text, Title } = Typography;

const scanStatusMeta: Record<
  ApplicationVersionRecord["scanStatus"],
  { color: string; label: string }
> = {
  failed: { color: "error", label: "校验失败" },
  passed: { color: "success", label: "校验通过" },
  pending: { color: "default", label: "校验中" },
};

export default function ApplicationVersionsPage() {
  const { applicationId } = useParams();
  const { data, error, isError, isPending } =
    useApplicationVersions(applicationId);
  const publishedVersion = usePublishedVersion(applicationId);

  return (
    <ApplicationAdminPage
      description="比较不可变的应用版本及其产物元数据。"
      title="版本管理"
    >
      <section aria-labelledby="versions-heading" className="space-y-4">
        <Title id="versions-heading" level={2} className="!mb-0">
          版本历史
        </Title>
        {isPending ? <Spin aria-label="版本记录加载中" /> : null}
        {isError ? (
          <Alert
            description={error.message}
            showIcon
            title="版本记录加载失败"
            type="error"
          />
        ) : null}
        {data && data.length === 0 ? (
          <Empty description="暂无版本记录" />
        ) : null}
        {data?.map((version) => (
          <div
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
            key={version.applicationVersionId}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Title level={3} className="!mb-1">
                  v{version.version}
                </Title>
                <Text type="secondary">
                  {version.changelog || "无变更说明"} ·{" "}
                  {new Date(version.createdAt).toLocaleDateString("zh-CN")}
                </Text>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color={scanStatusMeta[version.scanStatus].color}>
                  {scanStatusMeta[version.scanStatus].label}
                </Tag>
                {publishedVersion.data?.applicationVersionId ===
                version.applicationVersionId ? (
                  <Tag color="blue">当前版本</Tag>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        <Paragraph className="!mb-0 text-[#595959]">
          版本记录只追加；编辑会创建新版本。
        </Paragraph>
      </section>
    </ApplicationAdminPage>
  );
}
