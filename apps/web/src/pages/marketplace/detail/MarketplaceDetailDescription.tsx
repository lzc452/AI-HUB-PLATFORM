import type { CatalogEntry } from "@ai-hub/contracts";
import { DownloadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Space,
  Tag,
  Typography,
} from "antd";

import { useDepartments } from "../../../modules/auth/useIdentity";
import {
  buildBusinessScenario,
  buildKeyPoints,
  buildProblemStatement,
  deriveMaintainers,
  listAttachments,
} from "../../../modules/marketplace/detailContent";
import { RelatedApplications } from "./RelatedApplications";

const { Paragraph, Text, Title } = Typography;

export interface MarketplaceDetailDescriptionProps {
  entry: CatalogEntry;
}

const attachmentTypeColor: Record<
  "pdf" | "docx" | "doc" | "other",
  "red" | "blue" | "geekblue"
> = {
  doc: "blue",
  docx: "geekblue",
  other: "blue",
  pdf: "red",
};

/** 描述 Tab 内容：左栏介绍/截图/附件 + 右栏应用信息/相关推荐。 */
export function MarketplaceDetailDescription({
  entry,
}: MarketplaceDetailDescriptionProps) {
  const departments = useDepartments();
  const departmentName = departments.data?.find(
    (item) => item.departmentId === entry.departmentId,
  )?.name;

  const businessScenario = buildBusinessScenario(entry);
  const problemStatement = buildProblemStatement(entry);
  const keyPoints = buildKeyPoints(entry);
  const maintainers = deriveMaintainers(entry);
  const attachments = listAttachments(entry);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section
          aria-labelledby="intro-heading"
          className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
        >
          <Title id="intro-heading" level={2} className="!mb-3 !text-lg">
            详细介绍
          </Title>
          <div className="space-y-3 text-sm leading-relaxed text-[#1f1f1f]">
            <div>
              <Text strong>业务场景：</Text>
              <Paragraph className="!mb-0 mt-1 text-[#595959]">
                {businessScenario || "暂无业务场景描述"}
              </Paragraph>
            </div>
            <div>
              <Text strong>解决问题：</Text>
              <Paragraph className="!mb-0 mt-1 text-[#595959]">
                {problemStatement}
              </Paragraph>
            </div>
            <div>
              <Text strong>关键特点：</Text>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[#595959]">
                {keyPoints.map((point) => (
                  <li key={point.id}>{point.text}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="screenshots-heading"
          className="rounded-2xl border border-dashed border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
        >
          <Title id="screenshots-heading" level={2} className="!mb-3 !text-lg">
            截图预览
          </Title>
          <Empty description="该应用暂未上传截图" imageStyle={{ height: 80 }} />
        </section>

        <section
          aria-labelledby="attachments-heading"
          className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
        >
          <Title id="attachments-heading" level={2} className="!mb-3 !text-lg">
            相关附件
          </Title>
          <ul
            aria-label="附件列表"
            className="divide-y divide-[#f0f0f0] overflow-hidden rounded-xl border border-[#f0f0f0]"
          >
            {attachments.map((att) => (
              <li
                className="flex items-center justify-between gap-3 px-4 py-3"
                key={att.name}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Tag
                    className="!mr-0 w-14 justify-center text-center uppercase"
                    color={attachmentTypeColor[att.type]}
                  >
                    {att.type}
                  </Tag>
                  <span className="truncate text-sm text-[#1f1f1f]">
                    {att.name}
                  </span>
                  <span className="text-xs text-[#8c8c8c]">{att.size}</span>
                </div>
                <Button
                  aria-label={`下载 ${att.name}`}
                  disabled
                  icon={<DownloadOutlined aria-hidden="true" />}
                  size="small"
                  type="link"
                >
                  下载
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside aria-label="应用信息与推荐" className="space-y-4 lg:col-span-1">
        <Card
          aria-labelledby="info-heading"
          className="rounded-2xl shadow-sm"
          title={
            <span id="info-heading" className="text-base">
              应用信息
            </span>
          }
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="分类">
              <Tag color="geekblue" className="!mr-0">
                {entry.categoryId}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="维护人">
              <Space size={4} wrap>
                {maintainers.map((name) => (
                  <Tag className="!mr-0" key={name}>
                    {name}
                  </Tag>
                ))}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="所属部门">
              {departmentName ?? entry.departmentId}
            </Descriptions.Item>
            <Descriptions.Item label="标签">
              {entry.tagIds.length > 0 ? (
                <Space size={4} wrap>
                  {entry.tagIds.map((tag) => (
                    <Tag className="!mr-0" color="cyan" key={tag}>
                      {tag}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">暂无标签</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <RelatedApplications entry={entry} />
      </aside>
    </div>
  );
}
