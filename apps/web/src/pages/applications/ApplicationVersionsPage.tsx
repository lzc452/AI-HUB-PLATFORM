import { Button, Empty, Input, Select, Spin, Tag } from "antd";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage } from "../../components/common/ApplicationAdminPage";
import type { ApplicationVersionRecord } from "../../modules/application/application.client";
import {
  useApplicationVersions,
  usePublishedVersion,
} from "../../modules/application/useApplication";
import { MessageError, showWarningMessage } from "../../shared/ui/message";

const scanStatusMeta: Record<
  ApplicationVersionRecord["scanStatus"],
  { color: string; label: string }
> = {
  failed: { color: "error", label: "校验失败" },
  passed: { color: "success", label: "已发布" },
  pending: { color: "warning", label: "审核中" },
};

export default function ApplicationVersionsPage() {
  const { applicationId } = useParams();
  const versionsQuery = useApplicationVersions(applicationId);
  const publishedVersion = usePublishedVersion(applicationId);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const versions = versionsQuery.data ?? [];
  const current = publishedVersion.data ?? versions[0];
  const selected =
    versions.find((item) => item.applicationVersionId === selectedVersionId) ??
    current;
  const previous = useMemo(() => {
    if (!selected) return undefined;
    const index = versions.findIndex(
      (item) => item.applicationVersionId === selected.applicationVersionId,
    );
    return versions[index + 1] ?? versions[index - 1];
  }, [selected, versions]);

  return (
    <ApplicationAdminPage
      description="比较不可变的应用版本及其产物元数据。"
      showNavigation={false}
      title="版本管理"
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(430px,1fr)_minmax(0,2fr)]">
        <section className="app-admin-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f5] p-3">
            <div className="inline-flex rounded-md border border-[#d8e0eb] p-0.5">
              <Button className="!bg-[#1677ff] !text-white" size="small">
                时间轴视图
              </Button>
              <Button size="small" type="text">
                列表视图
              </Button>
            </div>
            <Input
              allowClear
              className="min-w-[180px] flex-1"
              placeholder="搜索版本号 / 发布说明"
              size="small"
            />
          </div>
          <div className="relative px-3 py-2 before:absolute before:bottom-8 before:left-[27px] before:top-5 before:w-px before:bg-[#dbe4f0]">
            {versions.length === 0 && !versionsQuery.isPending ? (
              <Empty className="py-12" description="暂无版本记录" />
            ) : null}
            {(versions.length ? versions : fallbackVersions).map(
              (version, index) => {
                const isCurrent =
                  version.applicationVersionId ===
                    current?.applicationVersionId ||
                  (!current && index === 0);
                const isSelected =
                  version.applicationVersionId ===
                  selected?.applicationVersionId;
                const meta = scanStatusMeta[version.scanStatus];
                return (
                  <button
                    className={`relative mb-2 flex w-full gap-4 rounded-lg border p-4 text-left transition ${isSelected ? "border-[#5796ff] bg-[#f8fbff] shadow-[0_0_0_1px_#5796ff]" : "border-[#e4eaf2] bg-white hover:border-[#9ebef4]"}`}
                    key={version.applicationVersionId}
                    onClick={() =>
                      setSelectedVersionId(version.applicationVersionId)
                    }
                    type="button"
                  >
                    <span
                      className={`relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white ring-1 ${isCurrent ? "bg-[#1677ff] ring-[#1677ff]" : meta.color === "warning" ? "bg-[#f59e0b] ring-[#f59e0b]" : "bg-[#20b26b] ring-[#20b26b]"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-[17px] text-[#1f2937]">
                          v{version.version.replace(/^v/, "")}
                        </strong>
                        {isCurrent ? <Tag color="blue">当前版本</Tag> : null}
                        <Tag color={meta.color}>{meta.label}</Tag>
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[#697386]">
                        <span>
                          <i
                            aria-hidden="true"
                            className="app-ui-icon app-ui-icon-calendar mr-1 text-[#8a94a6]"
                          />
                          {formatDate(version.createdAt)}
                        </span>
                        <span>
                          <i
                            aria-hidden="true"
                            className="app-ui-icon app-ui-icon-user mr-1 text-[#8a94a6]"
                          />
                          {version.createdByEmployeeId}
                        </span>
                      </span>
                      <span className="mt-2 block text-[13px] text-[#596579]">
                        {version.changelog ||
                          "优化票据识别模型，提升识别准确率；新增增值税电子发票支持。"}
                      </span>
                    </span>
                    <span
                      className={`hidden shrink-0 self-center rounded-md border px-3 py-1 text-xs sm:block ${isSelected ? "border-[#1677ff] bg-[#1677ff] text-white" : "border-[#d9e1ed] text-[#374151]"}`}
                    >
                      {isCurrent ? "查看详情" : "与当前版本对比"}
                    </span>
                  </button>
                );
              },
            )}
          </div>
          <div className="border-t border-[#edf0f5] px-5 py-3 text-[13px] text-[#697386]">
            共 {versions.length || 5} 个版本
          </div>
        </section>

        <div className="space-y-3">
          <section className="app-admin-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f5] px-5 py-4">
              <div>
                <h3 className="m-0 text-[17px] font-semibold text-[#1f2937]">
                  版本对比
                </h3>
                <p className="m-0 mt-1 text-[13px] text-[#8a94a6]">
                  选择两个版本查看字段、截图、风险和交付变化
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span>版本 A</span>
                <Select
                  size="small"
                  value={
                    selected
                      ? `v${selected.version.replace(/^v/, "")}`
                      : "v2.4.1"
                  }
                  options={versions.map((item) => ({
                    label: `v${item.version.replace(/^v/, "")}`,
                    value: `v${item.version.replace(/^v/, "")}`,
                  }))}
                />
                <span>VS</span>
                <Select
                  size="small"
                  value={
                    previous
                      ? `v${previous.version.replace(/^v/, "")}`
                      : "v2.4.0"
                  }
                  options={versions.map((item) => ({
                    label: `v${item.version.replace(/^v/, "")}`,
                    value: `v${item.version.replace(/^v/, "")}`,
                  }))}
                />
                <Button
                  type="primary"
                  onClick={() => showWarningMessage("版本对比已刷新")}
                >
                  开始对比
                </Button>
              </div>
            </div>
            <div className="space-y-4 p-5 text-[13px]">
              <CompareSection title="1. 基本信息变化">
                <CompareRow
                  field="描述"
                  oldValue="支持增值税发票、火车票等票据识别…"
                  newValue="优化发票识别模型，提升识别准确率；新增增值税电子发票支持。"
                />
                <CompareRow
                  field="标签"
                  oldValue="发票、报销、行政财务、OCR"
                  newValue="发票、报销、行政财务、电子发票、OCR"
                />
                <CompareRow field="维护人" oldValue="王芳" newValue="王芳" />
              </CompareSection>
              <CompareSection title="2. 截图变化">
                <div className="flex items-center gap-4">
                  <Thumb />
                  <Thumb variant="invoice" />
                  <i
                    aria-hidden="true"
                    className="app-ui-icon app-ui-icon-arrow h-5 w-5 text-[#6b7b94]"
                  />
                  <Thumb />
                  <Thumb variant="chart" />
                </div>
              </CompareSection>
              <CompareSection title="3. 风险声明变化">
                <div className="rounded-md border border-[#ffe1a8] bg-[#fff9eb] px-3 py-2 text-[#8a5a00]">
                  本应用仅用于识别票据，提升财务流程识别效率；所有识别结果仅供参考，不作为最终报销依据。
                </div>
              </CompareSection>
              <CompareSection title="4. 交付物变化">
                <CompareRow
                  field="Web 应用地址"
                  oldValue="https://aihub.com/apps/ocr"
                  newValue="https://aihub.com/apps/ocr"
                />
                <CompareRow
                  field="Android APK"
                  oldValue="ocr-app-2.4.0.apk (68.2 MB)"
                  newValue="ocr-app-2.4.1.apk (72.1 MB)"
                />
                <CompareRow
                  field="安装包签名"
                  oldValue="-"
                  newValue="SHA256: A1B2C3D4E5F6G7H8..."
                />
              </CompareSection>
            </div>
          </section>
          <section className="app-admin-card px-5 py-4">
            <h3 className="m-0 text-[16px] font-semibold">版本快照详情</h3>
            <div className="mt-3 grid gap-4 text-[13px] text-[#596579] sm:grid-cols-4">
              <span>
                发布人
                <br />
                <strong className="text-[#1f2937]">王芳</strong>
              </span>
              <span>
                发布时间
                <br />
                <strong className="text-[#1f2937]">2026-08-01 10:30</strong>
              </span>
              <span>
                审核记录
                <br />
                <strong className="text-[#16a66a]">
                  <i
                    aria-hidden="true"
                    className="app-ui-icon app-ui-icon-check mr-1"
                  />
                  已通过{" "}
                  <a className="text-[#1677ff]" href="#review">
                    查看详情
                  </a>
                </strong>
              </span>
              <span>
                关联工单
                <br />
                <strong className="text-[#1677ff]">
                  工单 #WORK20260801001 查看
                </strong>
              </span>
            </div>
          </section>
        </div>
      </div>
      {versionsQuery.isPending ? <Spin aria-label="版本记录加载中" /> : null}
      <MessageError
        active={versionsQuery.isError}
        cause={versionsQuery.error}
        title="版本记录加载失败"
      />
      {publishedVersion.isError ? (
        <MessageError
          active
          cause={publishedVersion.error}
          title="当前版本加载失败"
        />
      ) : null}
    </ApplicationAdminPage>
  );
}

const fallbackVersions: ApplicationVersionRecord[] = [
  {
    applicationId: "app-001",
    applicationVersionId: "v241",
    artifactKey: "ocr/2.4.1",
    artifactSha256: "sha",
    artifactSignature: null,
    changelog: "优化票据识别模型，提升识别准确率；新增增值税电子发票支持。",
    createdAt: "2026-08-01T10:30:00+08:00",
    createdByEmployeeId: "王芳",
    scanStatus: "passed",
    version: "2.4.1",
  },
  {
    applicationId: "app-001",
    applicationVersionId: "v240",
    artifactKey: "ocr/2.4.0",
    artifactSha256: "sha",
    artifactSignature: null,
    changelog:
      "优化票据结构，支持多税种识别；修复部分发票合计金额识别异常问题。",
    createdAt: "2026-07-15T10:30:00+08:00",
    createdByEmployeeId: "王芳",
    scanStatus: "passed",
    version: "2.4.0",
  },
  {
    applicationId: "app-001",
    applicationVersionId: "v230",
    artifactKey: "ocr/2.3.0",
    artifactSha256: "sha",
    artifactSignature: null,
    changelog: "新增火车票识别支持；优化出差报销场景结构化输出。",
    createdAt: "2026-06-28T10:30:00+08:00",
    createdByEmployeeId: "李小龙",
    scanStatus: "passed",
    version: "2.3.0",
  },
  {
    applicationId: "app-001",
    applicationVersionId: "v220",
    artifactKey: "ocr/2.2.0",
    artifactSha256: "sha",
    artifactSignature: null,
    changelog: "新增多语言识别能力；优化移动端体验。",
    createdAt: "2026-06-10T10:30:00+08:00",
    createdByEmployeeId: "王芳",
    scanStatus: "pending",
    version: "2.2.0",
  },
  {
    applicationId: "app-001",
    applicationVersionId: "v210",
    artifactKey: "ocr/2.1.0",
    artifactSha256: "sha",
    artifactSignature: null,
    changelog: "初版：支持增值税发票基本信息识别。",
    createdAt: "2026-05-28T10:30:00+08:00",
    createdByEmployeeId: "张伟",
    scanStatus: "pending",
    version: "2.1.0",
  },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
function CompareSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 text-[14px] font-semibold text-[#1f2937]">{title}</h4>
      {children}
    </section>
  );
}
function CompareRow({
  field,
  oldValue,
  newValue,
}: {
  field: string;
  oldValue: string;
  newValue: string;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr_1fr] overflow-hidden rounded border border-[#e2e8f0] text-[12px]">
      <span className="bg-[#f8fafc] px-3 py-2 font-medium">{field}</span>
      <span className="border-l border-[#e2e8f0] px-3 py-2 text-[#697386]">
        {oldValue}
      </span>
      <span className="border-l border-[#e2e8f0] bg-[#f0fff7] px-3 py-2 text-[#168255]">
        {newValue}
      </span>
    </div>
  );
}
function Thumb({
  variant = "dashboard",
}: {
  variant?: "dashboard" | "invoice" | "chart";
}) {
  return (
    <div className="h-14 w-24 rounded border border-[#dce5f2] bg-[#f8fbff] p-1">
      <div className="flex h-full gap-1">
        <i className="w-2 rounded-sm bg-[#bed6fb]" />
        <div className="flex-1 space-y-1">
          <i className="block h-1.5 w-2/5 rounded bg-[#8bb8ff]" />
          {variant === "chart" ? (
            <div className="flex h-8 items-end gap-0.5">
              <i className="h-2/5 flex-1 bg-[#8bb8ff]" />
              <i className="h-4/5 flex-1 bg-[#4d8df4]" />
              <i className="h-full flex-1 bg-[#a9c8f7]" />
            </div>
          ) : variant === "invoice" ? (
            <div className="h-8 rounded bg-white p-1">
              <i className="block h-1 w-3/4 bg-[#d6e3f4]" />
              <i className="mt-1 block h-1 w-full bg-[#e7eef8]" />
              <i className="mt-1 block h-2 w-1/3 border border-[#93b6ed]" />
            </div>
          ) : (
            <div className="h-8 rounded bg-white p-1">
              <i className="mb-1 block h-1 w-full bg-[#d6e3f4]" />
              <i className="block h-1 w-3/4 bg-[#e7eef8]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
