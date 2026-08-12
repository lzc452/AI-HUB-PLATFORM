import {
  CheckCircleFilled,
  DownloadOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  SafetyCertificateFilled,
  WarningFilled,
} from "@ant-design/icons";
import { Avatar, Button, Card, Empty, Input, Tag, Tabs, Timeline, Typography } from "antd";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ApplicationAdminPage, OcrApplicationIcon } from "../../components/common/ApplicationAdminPage";
import type { ApplicationRecord, ApplicationVersionRecord, ReviewRecord } from "../../modules/application/application.client";
import { useApplication, useApplicationReviews, useApplicationVersions } from "../../modules/application/useApplication";
import { MessageError, showSuccessMessage, showWarningMessage } from "../../shared/ui/message";

const { Text } = Typography;
const { TextArea } = Input;

type Check = { name: string; status: "passed" | "safe" | "warning" | "info"; description?: string };
type ViewModel = { app: ApplicationRecord | undefined; version: ApplicationVersionRecord | undefined; reviews: ReviewRecord[]; checks: Check[] };

export default function ApplicationReviewPage() {
  const { applicationId } = useParams();
  const applicationQuery = useApplication(applicationId);
  const versionsQuery = useApplicationVersions(applicationId);
  const reviewsQuery = useApplicationReviews(applicationId);
  const data = useMemo<ViewModel>(() => ({
    app: applicationQuery.data,
    version: versionsQuery.data?.[0],
    reviews: reviewsQuery.data?.length ? reviewsQuery.data : fallbackReviews,
    checks: validationChecks,
  }), [applicationQuery.data, reviewsQuery.data, versionsQuery.data]);
  const pending = applicationQuery.isPending || versionsQuery.isPending || reviewsQuery.isPending;
  const error = applicationQuery.error ?? versionsQuery.error ?? reviewsQuery.error;
  const hasError = applicationQuery.isError || versionsQuery.isError || reviewsQuery.isError;

  return <ApplicationAdminPage description="审核认领、审核意见、SLA 和历史记录。" showNavigation={false} title="审核工作台">
    {pending ? <SpinPlaceholder /> : null}
    <MessageError active={hasError} cause={error} title="审核工作台加载失败" />
    {!pending && !hasError ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]"><aside className="space-y-3"><TaskInfoCard version={data.version} app={data.app} /><ValidationCard checks={data.checks} /><ReviewActionCard /></aside><main className="space-y-3"><PreviewCard app={data.app} version={data.version} /><ReviewHistoryCard reviews={data.reviews} /></main></div> : null}
  </ApplicationAdminPage>;
}

function SpinPlaceholder() { return <div className="rounded-lg border border-[#e2e8f0] bg-white p-5 text-sm text-[#697386]">正在加载审核工作台…</div>; }

function TaskInfoCard({ app, version }: { app: ApplicationRecord | undefined; version: ApplicationVersionRecord | undefined }) {
  return <Card className="app-admin-card" styles={{ body: { padding: 16 } }} title={<span className="font-semibold">审核任务信息</span>}><div className="space-y-3 text-[13px]"><InfoLine label="SLA 剩余时间"><strong className="text-[18px] text-[#f59e0b]">18h 23m</strong></InfoLine><InfoLine label="提交人">{app?.ownerEmployeeId ?? "李小龙"}（财务部）</InfoLine><InfoLine label="提交时间"><span><i aria-hidden="true" className="app-ui-icon app-ui-icon-calendar mr-1 text-[#8a94a6]" />{formatDate(version?.createdAt ?? "2026-08-01T10:20:00+08:00")}</span></InfoLine><InfoLine label="当前领取人"><span><i aria-hidden="true" className="app-ui-icon app-ui-icon-user mr-1 text-[#8a94a6]" />王芳（审核组）</span></InfoLine></div><Button block className="mt-4" type="primary" onClick={() => showSuccessMessage("任务领取成功（只读预览）")}>领取任务</Button><div className="mt-2 grid grid-cols-2 gap-2"><Button onClick={() => showWarningMessage("已释放任务（只读预览）")}>释放任务</Button><Button onClick={() => showWarningMessage("任务转交功能将在下一版本开放")}>转交任务</Button></div></Card>;
}

function ValidationCard({ checks }: { checks: Check[] }) {
  const iconMap = { info: <InfoCircleOutlined />, passed: <CheckCircleFilled />, safe: <SafetyCertificateFilled />, warning: <WarningFilled /> };
  const colorMap = { info: "#1677ff", passed: "#20b26b", safe: "#20b26b", warning: "#f59e0b" };
  const labelMap = { info: "已生成", passed: "通过", safe: "安全", warning: "警告" };
  return <Card className="app-admin-card" styles={{ body: { padding: 16 } }} title={<span className="font-semibold">自动校验报告</span>}><div className="space-y-3">{checks.map((check) => <div className="flex items-start gap-2" key={check.name}><span className="mt-0.5" style={{ color: colorMap[check.status] }}>{iconMap[check.status]}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2 text-[13px]"><span>{check.name}</span><span style={{ color: colorMap[check.status] }}>{labelMap[check.status]}</span></div>{check.description ? <div className="text-[11px] text-[#8a94a6]">{check.description}</div> : null}</div></div>)}</div></Card>;
}

function ReviewActionCard() {
  const [reason, setReason] = useState("");
  return <Card className="app-admin-card" styles={{ body: { padding: 16 } }} title={<span className="font-semibold">审核操作</span>}><label className="text-[13px] font-medium text-[#374151]" htmlFor="reject-reason"><span className="text-[#f04444]">*</span> 驳回原因</label><TextArea id="reject-reason" aria-label="驳回原因" className="mt-2" maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="请输入驳回原因（必填）" showCount rows={4} /><div className="mt-3 grid grid-cols-2 gap-2"><Button type="primary" onClick={() => showSuccessMessage("已通过审核（只读预览）")}>通过审核</Button><Button aria-label="驳回" danger onClick={() => { if (!reason.trim()) { showWarningMessage("请输入驳回原因"); return; } showSuccessMessage("已驳回并记录原因（只读预览）"); }}>驳回</Button></div><Button block className="mt-2" onClick={() => showWarningMessage("备注已保存（只读预览）")}>保存备注</Button><div className="mt-3 text-[11px] text-[#8a94a6]"><InfoCircleOutlined /> 提示：不可审核自己参与的应用，请按流程完成审核。</div></Card>;
}

function PreviewCard({ app, version }: { app: ApplicationRecord | undefined; version: ApplicationVersionRecord | undefined }) {
  return <Card className="app-admin-card" styles={{ body: { padding: 0 } }}><Tabs className="review-preview-tabs" defaultActiveKey="preview" items={[{ key: "preview", label: "预览详情", children: <PreviewOverview app={app} version={version} /> }, { key: "diff", label: "版本差异", children: <Empty description="版本差异对比将在下一版本开放" /> }, { key: "validation", label: "自动校验报告", children: <ValidationSummary /> }, { key: "risk", label: "风险声明", children: <Empty description="暂无风险声明" /> }]} /></Card>;
}

function PreviewOverview({ app, version }: { app: ApplicationRecord | undefined; version: ApplicationVersionRecord | undefined }) {
  // 预览内容使用设计稿中的中文间隔，保留信息层级。
  // eslint-disable-next-line no-irregular-whitespace
  return <div className="space-y-5 p-5"><div className="flex items-start gap-4"><OcrApplicationIcon className="h-20 w-20" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="m-0 text-[20px] font-semibold">{app?.name ?? "OCR 票据识别"}</h3><Tag color="magenta">推荐</Tag><Tag color="success">已上架</Tag><Tag color="blue">Web 应用</Tag></div><div className="mt-2 flex flex-wrap gap-4 text-[13px] text-[#697386]"><span className="inline-flex items-center gap-1"><i aria-hidden="true" className="app-ui-icon app-ui-icon-star text-[#f59e0b]" />评分 4.8（210）</span><span>使用 1.6k</span><span>所属部门：<strong className="text-[#374151]">财务部</strong></span><span>责任人：<strong className="text-[#374151]">李小龙（财务部）</strong></span></div></div><Button size="small" onClick={() => showWarningMessage("应用详情将在新页面打开")}>查看应用详情</Button></div><div className="grid gap-3 md:grid-cols-2"><section className="rounded-lg border border-[#e4eaf2] p-4"><h4 className="mb-2 font-semibold">详细介绍</h4><p className="m-0 text-[13px] leading-6 text-[#596579]">业务场景：发票增值税发票、交通票据、火车票等类型，提供高效准确的票据识别与结构化输出能力，助力财务报销和业务数据自动化处理。</p><h4 className="mb-2 mt-4 font-semibold">关键特点</h4><ul className="m-0 list-disc space-y-1 pl-5 text-[13px] text-[#596579]"><li>自动化识别增值税发票、交通票据、火车票等类型</li><li>提高财务报销效率，提升数据级及结构化率</li><li>支持多语言识别，支持数字语言识别</li></ul></section><section className="rounded-lg border border-[#e4eaf2] p-4"><h4 className="mb-2 font-semibold">关键特性</h4><ul className="m-0 list-disc space-y-1 pl-5 text-[13px] text-[#596579]"><li>高精度 OCR 识别，准确率 ≥ 98%</li><li>支持多语言识别（中 / 英 / 日 / 韩）</li><li>自动校验票据信息，异常预警</li><li>提供开放 API，方便系统集成</li></ul></section></div><div className="grid gap-3 md:grid-cols-2"><section className="rounded-lg border border-[#e4eaf2] p-4"><h4 className="mb-3 font-semibold">截图预览</h4><div className="grid grid-cols-3 gap-2"><MiniShot /><MiniShot variant="invoice" /><MiniShot variant="chart" /></div></section><section className="rounded-lg border border-[#e4eaf2] p-4"><h4 className="mb-3 font-semibold">相关附件</h4><div className="space-y-3">{["OCR 票据识别_产品白皮书.pdf", "OCR 票据识别_接入指南.docx", "OCR 票据识别_字段说明.xlsx"].map((item, index) => <div className="flex items-center gap-2 text-[12px]" key={item}><span className="flex h-7 w-7 items-center justify-center rounded bg-[#eef5ff] text-[#1677ff]"><FileTextOutlined /></span><span className="min-w-0 flex-1 truncate">{item}</span><span className="text-[#8a94a6]">{["2.34 MB", "1.21 MB", "98.6 KB"][index]}</span><DownloadOutlined className="text-[#1677ff]" /></div>)}</div></section></div><Text type="secondary">提交版本：v{(version?.version ?? "2.4.1").replace(/^v/, "")}　·　当前状态：待审核</Text></div>;
}

// eslint-disable-next-line no-irregular-whitespace
function ValidationSummary() { return <div className="p-5"><Timeline items={validationChecks.map((item) => ({ color: item.status === "warning" ? "orange" : "green", children: <span className="text-[13px]">{item.name}　<Tag color={item.status === "warning" ? "warning" : "success"}>{item.status === "warning" ? "警告" : "通过"}</Tag></span> }))} /></div>; }
function ReviewHistoryCard({ reviews }: { reviews: ReviewRecord[] }) { return <Card className="app-admin-card" styles={{ body: { padding: 20 } }} title={<span className="font-semibold">审核意见记录</span>}><div className="space-y-4">{reviews.map((review) => <div className="flex gap-3 border-b border-[#edf0f5] pb-4 last:border-0 last:pb-0" key={review.reviewId}><Avatar className="shrink-0 bg-[#1677ff]">{review.reviewerEmployeeId.slice(0, 1)}</Avatar><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-[13px]">{review.reviewerEmployeeId}</strong><Tag color={review.decision === "approve" ? "success" : review.decision === "reject" ? "error" : "warning"}>{review.decision === "approve" ? "通过建议" : review.decision === "reject" ? "驳回" : "补充说明"}</Tag><span className="ml-auto text-[12px] text-[#8a94a6]">{formatDate(review.createdAt)}</span></div><p className="m-0 mt-1 text-[13px] text-[#596579]">{review.comment || "暂无审核意见"}</p></div></div>)}</div></Card>; }
function InfoLine({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-3"><span className="text-[#697386]">{label}</span><span className="text-right text-[#374151]">{children}</span></div>; }
function MiniShot({ variant = "dashboard" }: { variant?: "dashboard" | "invoice" | "chart" }) { return <div className="h-20 rounded border border-[#dce5f2] bg-[#f8fbff] p-1"><div className="flex h-full gap-1"><i className="w-2 rounded-sm bg-[#bed6fb]" /><div className="flex-1 space-y-1"><i className="block h-1.5 w-2/5 rounded bg-[#8bb8ff]" />{variant === "chart" ? <div className="flex h-12 items-end gap-1"><i className="h-1/2 flex-1 bg-[#8bb8ff]" /><i className="h-full flex-1 bg-[#4d8df4]" /><i className="h-2/3 flex-1 bg-[#a9c8f7]" /></div> : <div className="h-12 rounded bg-white p-1"><i className="mb-2 block h-1.5 w-full bg-[#d6e3f4]" /><i className="block h-1.5 w-3/4 bg-[#e7eef8]" /><i className="mt-2 block h-3 w-1/3 border border-[#93b6ed]" /></div>}</div></div></div>; }
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }

const validationChecks: Check[] = [
  { name: "格式校验", status: "passed" },
  { name: "文件扫描", status: "safe", description: "未检测到病毒或风险文件" },
  { name: "安装包签名", status: "warning", description: "证书将于 2026-09-15 过期" },
  { name: "大小限制", status: "passed", description: "安装包大小 98.6 KB，符合限制" },
  { name: "SHA-256", status: "info", description: "b3e5d2a1…e9f7c4b8（完整值）" },
];

const fallbackReviews: ReviewRecord[] = [
  { applicationId: "app-001", applicationOwnerEmployeeId: "李小龙", applicationVersionId: "ver-001", comment: "应用整体功能完善，自动校验通过，建议通过审核并上线。", createdAt: "2026-08-01T09:30:00+08:00", decision: "approve", reviewerEmployeeId: "王芳", reviewId: "review-mock-1" },
  { applicationId: "app-001", applicationOwnerEmployeeId: "李小龙", applicationVersionId: "ver-001", comment: "安装包签名证书将于 2026-09-15 过期，请关注更新并及时续签。", createdAt: "2026-08-01T09:05:00+08:00", decision: "request_changes", reviewerEmployeeId: "刘涛（安全组）", reviewId: "review-mock-2" },
];
