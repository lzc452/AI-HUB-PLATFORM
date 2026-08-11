/**
 * 系统安全审计数据客户端。
 * 注意：demo 数据，后端暂无审计 API——当前以 Promise 包装本地演示数据，
 * 待后端提供 /internal 审计接口后，将本文件实现替换为真实请求即可，
 * 上层 useSecurityAuditLogs 与页面组件无需改动。
 */

/** 单条审计日志的详情载荷（右栏「日志详情」展示）。 */
export interface AuditLogDetail {
  /** 审计备注。 */
  auditNote: string;
  /** 详情内容 JSON（代码块逐行渲染）。 */
  detailJson: Record<string, string>;
  /** 影响范围。 */
  impactScope: string;
  /** 风险等级：低风险 / 中风险 / 高风险。 */
  riskLevel: "低风险" | "中风险" | "高风险";
}

/** 审计日志表格行。 */
export interface AuditLogRow {
  /** 操作类型（对应 ACTION_TYPE_META 的 Tag 语义）。 */
  actionType: string;
  /** 详情载荷（右栏「日志详情」展示）。 */
  detail: AuditLogDetail;
  /** 模块。 */
  module: string;
  /** 操作人部门（表格以半角括号展示，详情以全角括号展示）。 */
  operatorDepartment: string;
  /** 操作人姓名。 */
  operatorName: string;
  /** 详情摘要。 */
  summary: string;
  /** 时间，格式 YYYY-MM-DD HH:mm:ss。 */
  time: string;
  /** 追踪 ID（表格列展示，16 位十六进制）。 */
  traceId: string;
}

/** 设计图逐字数据：前 8 行审计日志。 */
const VERBATIM_ROWS: AuditLogRow[] = [
  {
    actionType: "登录成功",
    detail: {
      auditNote: "用户登录行为正常，未发现异常。",
      detailJson: {
        event: "login_success",
        userId: "u_10086",
        userName: "李小龙",
        department: "财务部",
        ip: "10.1.2.45",
        location: "上海市",
        device: "Windows 10 / Chrome 125.0",
        result: "success",
      },
      impactScope: "无",
      riskLevel: "低风险",
    },
    module: "登录认证",
    operatorDepartment: "财务部",
    operatorName: "李小龙",
    summary: "用户通过密码登录成功，IP：10.1.2.45",
    time: "2025-06-01 10:20:13",
    traceId: "8f3e2c9d7a1b4e8c",
  },
  {
    actionType: "修改上传限制",
    detail: {
      auditNote: "配置变更已生效，业务方已知悉。",
      detailJson: {
        event: "upload_limit_changed",
        userId: "u_10032",
        userName: "王芳",
        department: "财务部",
        app: "OCR票据识别",
        from: "50MB",
        to: "20MB",
        result: "success",
      },
      impactScope: "Web 应用「OCR票据识别」",
      riskLevel: "低风险",
    },
    module: "安全配置",
    operatorDepartment: "财务部",
    operatorName: "王芳",
    summary: "将 Web 应用「OCR票据识别」上传限制从 50MB 调整为 20MB",
    time: "2025-06-01 10:15:42",
    traceId: "c1a9b8e6f3d7452a",
  },
  {
    actionType: "强制下线会话",
    detail: {
      auditNote: "下线操作由运维流程触发，已通知当事人。",
      detailJson: {
        event: "session_force_logout",
        userId: "u_10021",
        userName: "刘涛",
        department: "运维部",
        targetUser: "张伟",
        sessionCount: "2",
        result: "success",
      },
      impactScope: "用户「张伟」的 2 个会话",
      riskLevel: "中风险",
    },
    module: "会话管理",
    operatorDepartment: "运维部",
    operatorName: "刘涛",
    summary: "强制下线用户「张伟」的 2 个会话",
    time: "2025-06-01 10:12:08",
    traceId: "a6d7f8b2c9e1439f",
  },
  {
    actionType: "放行隔离文件",
    detail: {
      auditNote: "人工复核后确认无恶意内容，予以放行。",
      detailJson: {
        event: "quarantine_release",
        operator: "system",
        fileName: "Invoice_20250601.pdf",
        riskLevel: "中",
        scanner: "sandbox-v3",
        result: "released",
      },
      impactScope: "文件「Invoice_20250601.pdf」",
      riskLevel: "中风险",
    },
    module: "文件扫描",
    operatorDepartment: "自动",
    operatorName: "系统",
    summary: "放行隔离文件「Invoice_20250601.pdf」风险等级：中",
    time: "2025-06-01 10:05:31",
    traceId: "d4e5f6a7b8c94210",
  },
  {
    actionType: "重置密码策略",
    detail: {
      auditNote: "策略调整符合季度安全基线要求。",
      detailJson: {
        event: "password_policy_changed",
        userId: "u_10003",
        userName: "张伟",
        department: "产品部",
        strength: "中",
        result: "success",
      },
      impactScope: "全平台密码策略",
      riskLevel: "低风险",
    },
    module: "安全配置",
    operatorDepartment: "产品部",
    operatorName: "张伟",
    summary: "重置系统密码策略为「中」强度",
    time: "2025-06-01 09:56:18",
    traceId: "b2c3d4e5f6a7481b",
  },
  {
    actionType: "下载敏感文件",
    detail: {
      auditNote: "下载行为已登记，建议关注后续流转。",
      detailJson: {
        event: "sensitive_file_download",
        userId: "u_10086",
        userName: "李小龙",
        department: "财务部",
        fileName: "salary_list.xlsx",
        result: "success",
      },
      impactScope: "文件「salary_list.xlsx」",
      riskLevel: "中风险",
    },
    module: "数据防泄漏",
    operatorDepartment: "财务部",
    operatorName: "李小龙",
    summary: "下载敏感文件「salary_list.xlsx」",
    time: "2025-06-01 09:48:07",
    traceId: "f1e2d3c4b5a6478c",
  },
  {
    actionType: "创建 API 密钥",
    detail: {
      auditNote: "密钥用于第三方集成，已绑定最小权限范围。",
      detailJson: {
        event: "api_key_created",
        userId: "u_10032",
        userName: "王芳",
        department: "财务部",
        purpose: "第三方集成",
        result: "success",
      },
      impactScope: "无",
      riskLevel: "低风险",
    },
    module: "安全配置",
    operatorDepartment: "财务部",
    operatorName: "王芳",
    summary: "创建新的 API 密钥用于第三方集成",
    time: "2025-06-01 09:35:22",
    traceId: "9a8b7c6d5e4f321a",
  },
  {
    actionType: "高风险告警",
    detail: {
      auditNote: "已触发高风险告警，等待安全人员处置。",
      detailJson: {
        event: "abnormal_login_alert",
        sourceIp: "203.0.113.8",
        attempts: "6",
        location: "境外",
        severity: "high",
        result: "alerted",
      },
      impactScope: "登录入口",
      riskLevel: "高风险",
    },
    module: "安全告警",
    operatorDepartment: "自动",
    operatorName: "系统",
    summary: "检测到异常登录行为，来源 IP：203.0.113.8",
    time: "2025-06-01 09:20:55",
    traceId: "7d6c5b4a3e2f1098",
  },
];

/** 生成行的循环模板：与设计图同一批操作类型 / 模块 / 操作人。 */
const GENERATED_TEMPLATES: Pick<
  AuditLogRow,
  "actionType" | "module" | "operatorDepartment" | "operatorName"
>[] = [
  {
    actionType: "登录成功",
    module: "登录认证",
    operatorDepartment: "财务部",
    operatorName: "李小龙",
  },
  {
    actionType: "修改上传限制",
    module: "安全配置",
    operatorDepartment: "财务部",
    operatorName: "王芳",
  },
  {
    actionType: "强制下线会话",
    module: "会话管理",
    operatorDepartment: "运维部",
    operatorName: "刘涛",
  },
  {
    actionType: "放行隔离文件",
    module: "文件扫描",
    operatorDepartment: "自动",
    operatorName: "系统",
  },
  {
    actionType: "重置密码策略",
    module: "安全配置",
    operatorDepartment: "产品部",
    operatorName: "张伟",
  },
  {
    actionType: "下载敏感文件",
    module: "数据防泄漏",
    operatorDepartment: "财务部",
    operatorName: "李小龙",
  },
  {
    actionType: "创建 API 密钥",
    module: "安全配置",
    operatorDepartment: "财务部",
    operatorName: "王芳",
  },
  {
    actionType: "高风险告警",
    module: "安全告警",
    operatorDepartment: "自动",
    operatorName: "系统",
  },
];

const GENERATED_SUMMARIES: Record<string, string> = {
  登录成功: "用户通过密码登录成功，IP：10.1.2.45",
  修改上传限制: "将 Web 应用「OCR票据识别」上传限制从 50MB 调整为 20MB",
  强制下线会话: "强制下线用户「张伟」的 2 个会话",
  放行隔离文件: "放行隔离文件「Invoice_20250601.pdf」风险等级：中",
  重置密码策略: "重置系统密码策略为「中」强度",
  下载敏感文件: "下载敏感文件「salary_list.xlsx」",
  "创建 API 密钥": "创建新的 API 密钥用于第三方集成",
  高风险告警: "检测到异常登录行为，来源 IP：203.0.113.8",
};

const HEX_CHARS = "0123456789abcdef";

/** 由索引确定性地生成 16 位十六进制追踪 ID（demo 数据，避免随机导致渲染不一致）。 */
function buildTraceId(index: number): string {
  let seed = (index + 7) * 2654435761;
  let id = "";
  for (let i = 0; i < 16; i += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    id += HEX_CHARS.charAt(seed % 16);
  }
  return id;
}

/** 生成 120 条补充行，使分页与设计图一致（共 128 条、13 页）。 */
function buildGeneratedRows(): AuditLogRow[] {
  const rows: AuditLogRow[] = [];
  // 自 09:12 起每 4 分钟一条，全部落在 2025-06-01 默认筛选区间内。
  let minutes = 9 * 60 + 12;
  for (let i = 0; i < 120; i += 1) {
    const template =
      GENERATED_TEMPLATES[i % GENERATED_TEMPLATES.length] ??
      (GENERATED_TEMPLATES[0] as (typeof GENERATED_TEMPLATES)[number]);
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    const second = String((i * 13) % 60).padStart(2, "0");
    minutes -= 4;
    rows.push({
      actionType: template.actionType,
      detail: {
        auditNote: "例行操作，未发现异常。",
        detailJson: {
          event: "audit_event",
          userName: template.operatorName,
          department: template.operatorDepartment,
          action: template.actionType,
          result: "success",
        },
        impactScope: "无",
        riskLevel: i % 9 === 8 ? "高风险" : i % 4 === 3 ? "中风险" : "低风险",
      },
      module: template.module,
      operatorDepartment: template.operatorDepartment,
      operatorName: template.operatorName,
      summary:
        GENERATED_SUMMARIES[template.actionType] ?? "例行安全操作，已记录。",
      time: `2025-06-01 ${hour}:${minute}:${second}`,
      traceId: buildTraceId(i),
    });
  }
  return rows;
}

/** 完整 demo 数据集：8 条设计图逐字行 + 120 条补充行。 */
export const SECURITY_AUDIT_DEMO_ROWS: AuditLogRow[] = [
  ...VERBATIM_ROWS,
  ...buildGeneratedRows(),
];

/**
 * 获取审计日志列表。
 * demo 数据，后端暂无审计 API：直接返回本地演示数据；
 * 后续切换为 apiFetch("/internal/security/audit-logs") 时保持签名不变。
 */
export function fetchSecurityAuditLogs(): Promise<AuditLogRow[]> {
  return Promise.resolve(SECURITY_AUDIT_DEMO_ROWS);
}
