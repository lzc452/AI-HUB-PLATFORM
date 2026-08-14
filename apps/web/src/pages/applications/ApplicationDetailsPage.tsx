import { Button, Empty, Spin, Tag, Tooltip, Typography } from "antd";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import {
  useApplication,
  usePublishedVersion,
} from "../../modules/application/useApplication";
import { MessageError } from "../../shared/ui/message";

const { Paragraph, Text } = Typography;

const lifecycleStates = [
  "草稿",
  "审核中",
  "已通过",
  "已上架",
  "已驳回",
  "已下架",
  "已归档",
];

export default function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const applicationQuery = useApplication(applicationId);
  const publishedVersion = usePublishedVersion(applicationId);
  const application = applicationQuery.data;

  return (
    <ApplicationAdminPage
      description={`${application?.name ?? "OCR 票据识别"} 的应用信息与发布状态。`}
      title="应用详情"
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(340px,1.1fr)]">
        <main className="app-admin-card overflow-hidden">
          <section className="border-b border-[#edf0f5] px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="m-0 text-[16px] font-semibold text-[#1f2937]">
                    当前版本内容预览
                  </h3>
                  <Tag color="blue">最新版本 v2.4.1</Tag>
                  <Text type="secondary">发布于 2024-05-01</Text>
                </div>
                <Paragraph className="!mb-0 max-w-[760px] text-[14px] leading-6 text-[#596579]">
                  本版本优化了识别引擎，提升复杂票据识别准确率；新增多语言识别能力，完善异常票据处理策略。
                </Paragraph>
              </div>
              <ScreenshotPreview className="hidden h-[72px] w-[280px] shrink-0 sm:block" />
            </div>
          </section>
          <DetailSection title="业务场景">
            发票增值税发票、交通票据、火车票、出租车票等各类票据的购销、报销、财务报销和业务录入等场景，帮助财务人员快速完成票据信息的录入与核对。
          </DetailSection>
          <DetailSection title="解决问题">
            手工录入票据信息效率低、易出错；票据格式多样，难以统一处理；报销流程中票据信息核验耗时长，影响整体效率。
          </DetailSection>
          <section className="border-b border-[#edf0f5] px-6 py-3">
            <h3 className="mb-2 text-[16px] font-semibold text-[#1f2937]">
              关键特性
            </h3>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {[
                "支持多种票据类型识别",
                "结构化输出，支持多种导出格式",
                "高精度识别，准确率 ≥ 98%",
                "支持多语言识别（中 / 英 / 日 / 韩）",
                "自动校验票据信息，异常预警",
                "提供开放 API，方便系统集成",
              ].map((item) => (
                <div
                  className="flex items-center gap-2 text-[14px] leading-6 text-[#4b5563]"
                  key={item}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1677ff]" />
                  {item}
                </div>
              ))}
            </div>
          </section>
          <section className="border-b border-[#edf0f5] px-6 py-3">
            <h3 className="mb-2 text-[16px] font-semibold text-[#1f2937]">
              截图预览
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ScreenshotPreview />
              <ScreenshotPreview variant="invoice" />
              <ScreenshotPreview variant="chart" />
            </div>
          </section>
          <section className="px-6 py-3">
            <h3 className="mb-1 text-[16px] font-semibold text-[#1f2937]">
              相关附件
            </h3>
            <div className="divide-y divide-[#edf0f5]">
              {[
                [
                  "OCR 票据识别_产品白皮书.pdf",
                  "2.34 MB",
                  "2024-04-28",
                  "#f04444",
                ],
                [
                  "OCR 票据识别_接入指南.docx",
                  "1.21 MB",
                  "2024-04-28",
                  "#3789d8",
                ],
                [
                  "OCR 票据识别_字段说明.xlsx",
                  "98.6 KB",
                  "2024-04-28",
                  "#28b675",
                ],
              ].map(([name, size, date, color]) => (
                <div
                  className="flex min-h-[44px] items-center gap-3 text-[13px]"
                  key={String(name)}
                >
                  <i
                    aria-hidden="true"
                    className="app-ui-icon app-ui-icon-file text-lg"
                    style={{ color: String(color) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[#374151]">
                    {name}
                  </span>
                  <span className="w-20 text-right text-[#8a94a6]">{size}</span>
                  <span className="hidden w-24 text-right text-[#8a94a6] sm:block">
                    {date}
                  </span>
                  <Tooltip title="附件下载暂未纳入 V1 交付契约">
                    <Button
                      aria-label={`下载 ${String(name)}`}
                      disabled
                      size="small"
                    >
                      下载
                    </Button>
                  </Tooltip>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="space-y-3">
          <InfoCard title="应用信息">
            <InfoRow label="分类" value="办公效率 / 财务报销" />
            <InfoRow
              label="标签"
              value={
                <span className="flex gap-1">
                  <Tag color="blue">知识型</Tag>
                  <Tag>自动化</Tag>
                  <Tag>OCR</Tag>
                </span>
              }
            />
            <InfoRow label="最近更新时间" value="2024-05-01 10:30" />
          </InfoCard>
          <InfoCard title="可见范围 / 受众">
            <InfoRow label="可见部门" value="财务部、法务部、行政部、采购部" />
            <InfoRow label="目标用户" value="财务专员、报销人员、业务人员" />
          </InfoCard>
          <InfoCard title="维护团队">
            <InfoRow label="责任人" value="李小龙（财务部）" />
            <InfoRow label="维护人" value="王芳、刘涛（财务部）" />
            <InfoRow
              label="最近操作"
              value="王芳 于 2024-05-01 10:30 编辑了应用信息"
            />
          </InfoCard>
          <InfoCard title="发布状态">
            <div className="relative space-y-4 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-[#cbd5e1]">
              {[
                ["草稿", "2024-04-20 09:12", "李小龙 创建应用", "#6ea8fe"],
                [
                  "审核通过",
                  "2024-04-25 14:30",
                  "系统管理员 审核通过",
                  "#1677ff",
                ],
                ["已上架", "2024-05-01 10:30", "王芳 上架应用", "#20b26b"],
              ].map(([label, date, desc, color]) => (
                <div className="relative" key={String(label)}>
                  <span
                    className="absolute -left-5 top-0.5 h-3 w-3 rounded-full border-2 border-white"
                    style={{
                      background: String(color),
                      boxShadow: `0 0 0 1px ${String(color)}`,
                    }}
                  />
                  <div className="text-[14px] font-medium text-[#374151]">
                    {label}
                  </div>
                  <div className="text-[12px] text-[#8a94a6]">
                    {date} / {desc}
                  </div>
                </div>
              ))}
            </div>
          </InfoCard>
        </aside>
      </div>
      {applicationQuery.isPending ? <Spin aria-label="应用数据加载中" /> : null}
      <MessageError
        active={applicationQuery.isError}
        cause={applicationQuery.error}
        title="应用数据加载失败"
      />
      {publishedVersion.isError ? (
        <MessageError
          active
          cause={publishedVersion.error}
          title="当前版本加载失败"
        />
      ) : null}
      {applicationQuery.data === null ? (
        <Empty description="暂无应用信息" />
      ) : null}
      <div className="sr-only" aria-label="应用生命周期状态">
        {lifecycleStates.map((state) => (
          <span key={state}>{state}</span>
        ))}
        <span>当前版本</span>
      </div>
    </ApplicationAdminPage>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#edf0f5] px-6 py-3">
      <h3 className="mb-1 text-[16px] font-semibold text-[#1f2937]">{title}</h3>
      <p className="m-0 text-[14px] leading-6 text-[#596579]">{children}</p>
    </section>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="app-admin-card overflow-hidden">
      <h3 className="app-admin-card-title">{title}</h3>
      <div className="space-y-2 px-5 py-3">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-[13px] leading-6">
      <span className="w-[82px] shrink-0 text-[#8a94a6]">{label}</span>
      <span className="min-w-0 flex-1 text-[#374151]">{value}</span>
    </div>
  );
}

function ScreenshotPreview({
  className = "",
  variant = "dashboard",
}: {
  className?: string;
  variant?: "dashboard" | "invoice" | "chart";
}) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-[#d8e0eb] bg-[#f8fbff] p-2 ${className}`}
    >
      <div className="flex h-full gap-1.5">
        <div className="w-3 rounded-sm bg-[#dbe8fc]" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-2 w-2/5 rounded bg-[#abc9ff]" />
          {variant === "chart" ? (
            <div className="flex h-[56%] items-end gap-1 rounded bg-white p-2">
              <i className="h-1/3 flex-1 bg-[#72a8ff]" />
              <i className="h-2/3 flex-1 bg-[#3d83f6]" />
              <i className="h-full flex-1 bg-[#9bc2ff]" />
              <i className="h-1/2 flex-1 bg-[#5f96ef]" />
            </div>
          ) : variant === "invoice" ? (
            <div className="h-[56%] rounded bg-white p-2">
              <div className="mb-2 h-2 w-1/2 rounded bg-[#c8d7ed]" />
              <div className="h-1.5 w-full rounded bg-[#e4ebf5]" />
              <div className="mt-1.5 h-1.5 w-3/4 rounded bg-[#e4ebf5]" />
              <div className="mt-2 h-5 w-1/3 rounded border border-[#91b9f7]" />
            </div>
          ) : (
            <div className="h-[56%] rounded bg-white p-2">
              <div className="mb-2 flex gap-1">
                <i className="h-2 w-1/4 rounded bg-[#8fbbff]" />
                <i className="h-2 w-1/3 rounded bg-[#d4e4ff]" />
                <i className="h-2 w-1/5 rounded bg-[#8fbbff]" />
              </div>
              <div className="space-y-1">
                <i className="block h-1.5 w-full rounded bg-[#e4ebf5]" />
                <i className="block h-1.5 w-4/5 rounded bg-[#e4ebf5]" />
                <i className="block h-1.5 w-11/12 rounded bg-[#e4ebf5]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
