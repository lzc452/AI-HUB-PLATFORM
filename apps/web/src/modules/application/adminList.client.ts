import type { DeliveryChannel } from "@ai-hub/contracts";

import type { AdminApplicationRow } from "./adminListMeta";

export interface AdminApplicationListResult {
  items: AdminApplicationRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminApplicationListParams {
  keyword?: string;
  mode?: "all" | "review" | "owned";
  status?: string;
  departmentId?: string;
  applicationType?: string;
  channel?: DeliveryChannel;
  sort?: "recent" | "name" | "status";
  page?: number;
  pageSize?: number;
}

/**
 * 应用管理列表数据源。
 *
 * 当前阶段先使用本地 mock 数据保证设计稿 1:1 还原。
 * 后续对接 `GET /internal/applications/admin-list` 时，
 * 只需把本实现替换为 `apiFetch<AdminApplicationListResult>(...)`，
 * 保持返回结构一致即可，调用方（hook、表格、筛选）无需修改。
 */
export async function getAdminApplicationList(
  params: AdminApplicationListParams = {},
): Promise<AdminApplicationListResult> {
  // 模拟网络延迟，便于在 UI 中观察骨架屏/过渡。
  await new Promise((resolve) => setTimeout(resolve, 120));

  const filtered = filterAdminList(mockAdminApplicationList, params);
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? 10);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    page,
    pageSize,
    total: filtered.length,
  };
}

function filterAdminList(
  rows: readonly AdminApplicationRow[],
  params: AdminApplicationListParams,
): AdminApplicationRow[] {
  let result = rows.slice();

  if (params.keyword) {
    const needle = params.keyword.trim().toLowerCase();
    if (needle) {
      result = result.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          row.applicationId.toLowerCase().includes(needle),
      );
    }
  }

  if (params.mode === "review") {
    result = result.filter((row) => row.needsMyReview);
  } else if (params.mode === "owned") {
    result = result.filter((row) => row.isMine);
  }

  if (params.status && params.status !== "all") {
    result = result.filter((row) => row.status === params.status);
  }

  if (params.departmentId && params.departmentId !== "all") {
    result = result.filter((row) => row.departmentName === params.departmentId);
  }

  if (params.applicationType && params.applicationType !== "all") {
    result = result.filter(
      (row) => row.categoryId === params.applicationType,
    );
  }

  if (params.channel) {
    result = result.filter((row) =>
      row.deliveryChannels.includes(params.channel as DeliveryChannel),
    );
  }

  if (params.sort === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  } else if (params.sort === "status") {
    result.sort((a, b) => a.status.localeCompare(b.status));
  } else {
    result.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  return result;
}

/**
 * Demo 数据：与设计稿 1:1 复刻，包含 42 条记录覆盖 4 个状态。
 * 应用 ID 编号延续 creator 命名空间，状态分布与 KPI 卡片对齐：
 *   - 已上架 26
 *   - 待审核 7
 *   - 草稿 6
 *   - 已下架 3（其中 3 个标记为交付异常）
 */
const mockAdminApplicationList: readonly AdminApplicationRow[] = [
  // 第 1 段：与设计稿顶部表格完全一致
  row("app-rd-perf-001", "统一研发效能数据看板", "研发提效", "published", "v2.4.1", "张伟", "研发部", ["web", "desktop"], 2, true, false, "汇聚需求、缺陷、CI 指标，提供研发团队效能全景视图。"),
  row("app-legal-002", "智能合同审查助手", "法务合规", "in_review", "v1.3.0", "李晓彤", "法务部", ["web"], 1, false, true, "法务日常合同条款风险识别与建议输出。"),
  row("app-supply-003", "供应链异常预警", "运营提效", "published", "v3.1.2", "陈晨", "供应链中心", ["web", "mobile"], 2, false, false, "实时监控供应商交付偏差，自动通知采购与计划。"),
  row("app-meeting-004", "会议纪要自动归档", "行政办公", "draft", "v0.8.0", "王浩", "销售部", ["web"], 4, true, false, "自动转写会议、抽取待办并按部门归档。"),
  row("app-equip-005", "生产设备故障预测", "生产制造", "withdrawn", "v1.9.4", "周敏", "制造中心", ["web", "mini_program"], 6, false, false, "基于振动与温度数据预测设备故障窗口。"),

  // 第 2 段：补充更多已上架应用，覆盖多部门与多渠道
  row("app-finance-006", "财务凭证自动核验", "财务税务", "published", "v2.0.0", "李娜", "财务部", ["web"], 7, false, true, "对接 ERP 自动核验凭证差异并生成核查报告。"),
  row("app-hr-007", "员工入职助手", "人事行政", "published", "v1.5.6", "赵静", "人力资源部", ["web", "mobile"], 9, false, false, "一站式办理入职流程，自动推送资料与培训。"),
  row("app-marketing-009", "营销素材智能生成", "市场增长", "published", "v1.2.3", "高琪", "市场部", ["web", "mini_program"], 12, true, false, "基于产品文案一键生成多尺寸投放素材。"),
  row("app-it-010", "内部知识库检索", "知识管理", "published", "v3.0.1", "黄涛", "信息技术部", ["web", "desktop", "mobile"], 15, false, false, "向量检索企业文档，支持自然语言提问。"),
  row("app-cs-011", "工单情绪分析", "客户服务", "published", "v2.6.0", "钱雷", "客户成功部", ["web"], 22, false, false, "实时识别工单情绪，辅助坐席调整沟通策略。"),

  // 第 3 段：补充待审核 / 草稿 / 已下架，覆盖 KPI 分布
  row("app-cs-008", "客户之声情绪分析", "客户服务", "in_review", "v0.9.2", "孙宇", "客户成功部", ["web"], 10, false, true, "分析工单与社媒情绪，输出客户满意度趋势。"),
  row("app-procure-012", "采购需求聚合", "采购供应链", "in_review", "v0.6.4", "李晓彤", "法务部", ["web"], 18, false, true, "汇总各部门采购意向并辅助选型建议。"),
  row("app-quality-013", "质检报告自动归集", "质量管理", "draft", "v0.4.1", "陈晨", "供应链中心", ["web"], 20, false, false, "实验室报告统一归集并按批次生成摘要。"),
  row("app-skill-014", "员工技能矩阵", "人事行政", "draft", "v0.7.2", "赵静", "人力资源部", ["web"], 26, false, false, "梳理岗位胜任力并跟踪员工成长路径。"),
  row("app-finance-015", "预算执行看板", "财务税务", "in_review", "v1.1.0", "李娜", "财务部", ["web"], 30, false, true, "按月汇总预算执行偏差，自动预警。"),
  row("app-sales-016", "商机智能评级", "市场增长", "in_review", "v0.5.0", "王浩", "销售部", ["web"], 36, true, true, "基于历史数据为新商机打分并推荐跟进策略。"),
  row("app-equip-017", "能源消耗监测", "生产制造", "withdrawn", "v1.2.0", "周敏", "制造中心", ["web", "desktop"], 40, false, false, "车间能耗分项计量，超阈值告警。"),
  row("app-equip-018", "设备点检助手", "生产制造", "published", "v2.3.0", "周敏", "制造中心", ["mobile"], 45, false, false, "点检任务派发与完成情况自动汇总。"),
  row("app-it-019", "API 网关观测", "研发提效", "published", "v1.8.0", "黄涛", "信息技术部", ["web"], 50, false, false, "网关流量、错误率、链路追踪一体化观测。"),

  // 第 4 段：补充更多已上架
  row("app-rd-perf-020", "代码评审助手", "研发提效", "published", "v1.4.5", "张伟", "研发部", ["web", "desktop"], 55, true, false, "识别 PR 风险并给出改进建议。"),
  row("app-legal-021", "合规法务知识库", "法务合规", "published", "v2.1.0", "李晓彤", "法务部", ["web"], 60, false, false, "集中管理合规制度与判例。"),
  row("app-supply-022", "供应商绩效画像", "供应链中心", "published", "v1.6.8", "陈晨", "供应链中心", ["web", "mini_program"], 70, false, false, "多维度评估供应商并支持对比。"),
  row("app-meeting-023", "会议室预约", "行政办公", "published", "v3.0.2", "王浩", "销售部", ["web", "mobile"], 75, false, false, "会议室资源可视化预约与提醒。"),
  row("app-cs-024", "知识库推荐", "客户服务", "published", "v1.3.4", "孙宇", "客户成功部", ["web"], 80, false, false, "坐席实时推荐知识库答案。"),
  row("app-marketing-025", "活动效果分析", "市场增长", "published", "v2.0.1", "高琪", "市场部", ["web"], 88, false, false, "市场活动全链路转化追踪。"),
  row("app-finance-026", "费用报销助手", "财务税务", "published", "v1.7.0", "李娜", "财务部", ["web", "mobile"], 95, false, false, "OCR 识别发票并自动生成报销单。"),
  row("app-hr-027", "招聘流程协同", "人事行政", "published", "v2.4.0", "赵静", "人力资源部", ["web"], 100, false, false, "JD 发布、简历聚合、面试安排一体化。"),
  row("app-it-028", "日志检索平台", "研发提效", "published", "v2.2.0", "黄涛", "信息技术部", ["web", "desktop"], 110, false, false, "统一日志接入与检索。"),
  row("app-cs-029", "客服质检", "客户服务", "in_review", "v0.8.5", "钱雷", "客户成功部", ["web"], 120, false, true, "自动抽检通话并输出评分。"),
  row("app-sales-030", "销售线索打分", "市场增长", "in_review", "v0.4.0", "王浩", "销售部", ["web"], 130, true, true, "为新线索打分并分派坐席。"),
  row("app-finance-031", "税务风险扫描", "财务税务", "draft", "v0.3.2", "李娜", "财务部", ["web"], 140, false, false, "对历史纳税数据进行风险扫描。"),
  row("app-quality-032", "不良品追溯", "质量管理", "draft", "v0.5.5", "陈晨", "供应链中心", ["web"], 150, false, false, "按批次追溯不良品流向。"),
  row("app-equip-033", "安全巡检", "生产制造", "draft", "v0.2.0", "周敏", "制造中心", ["mobile"], 165, false, false, "移动端安全巡检任务与整改跟踪。"),
  row("app-equip-034", "车间排产优化", "生产制造", "published", "v1.1.0", "周敏", "制造中心", ["web"], 180, false, false, "基于订单优先级与设备状态优化排产。"),
  row("app-it-035", "CMDB 维护", "研发提效", "published", "v2.0.3", "黄涛", "信息技术部", ["web"], 200, false, false, "配置项自动发现与一致性校验。"),
  row("app-cs-036", "FAQ 自动生成", "客户服务", "published", "v1.0.0", "孙宇", "客户成功部", ["web"], 220, false, false, "基于历史对话自动生成 FAQ。"),
  row("app-hr-037", "员工健康关怀", "人事行政", "published", "v0.9.0", "赵静", "人力资源部", ["web", "mobile"], 240, false, false, "员工体检与心理健康关怀提醒。"),
  row("app-marketing-038", "SEO 内容生成", "市场增长", "published", "v1.5.0", "高琪", "市场部", ["web"], 260, false, false, "基于关键词自动生成 SEO 友好的内容。"),
  row("app-equip-039", "生产排程看板", "生产制造", "withdrawn", "v1.4.0", "周敏", "制造中心", ["web", "mini_program"], 300, false, false, "车间排程可视化与异常告警。"),
  row("app-it-040", "故障自愈编排", "研发提效", "published", "v1.0.2", "黄涛", "信息技术部", ["web"], 320, false, false, "常见告警自动触发自愈剧本。"),
  row("app-cs-041", "客户健康度评分", "客户服务", "published", "v0.8.0", "钱雷", "客户成功部", ["web"], 360, false, false, "综合多维行为输出客户健康度评分。"),
  row("app-finance-042", "发票池管理", "财务税务", "published", "v0.7.0", "李娜", "财务部", ["web"], 400, false, false, "进项发票集中管理与勾稽。"),
];

function row(
  applicationId: string,
  name: string,
  categoryId: string,
  status: AdminApplicationRow["status"],
  currentVersion: string,
  ownerName: string,
  departmentName: string,
  deliveryChannels: readonly DeliveryChannel[],
  hoursAgo: number,
  isMine: boolean,
  needsMyReview: boolean,
  summary: string,
): AdminApplicationRow {
  return {
    applicationId,
    categoryId,
    currentVersion,
    deliveryChannels,
    departmentName,
    isMine,
    name,
    needsMyReview,
    ownerName,
    status,
    summary,
    updatedAt: hoursAgoIso(hoursAgo),
  };
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}
