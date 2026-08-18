import type { AudienceRule } from "@ai-hub/contracts";

/**
 * 受众选择界面状态（UI 多选 ↔ 规则数组的双向映射）。
 * 与契约一致：受众本身就是多条 AudienceRule——全体员工一条 all、
 * 每个部门一条 department（includeChildren 为全局开关，V1 简化）、
 * 每名员工一条 employee。
 */
export interface AudienceSelection {
  includeAll: boolean;
  departmentIds: string[];
  employeeIds: string[];
  /** 是否包含子部门（对当前所选全部部门生效）。 */
  includeChildren: boolean;
}

/** 历史草稿可能以数组形状保存过受众值（旧版 UI 的 bug），回显时取首项兼容。 */
function scalarOrFirst(
  value: string | string[] | null | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** 选择状态 → 规则数组：每个部门/员工生成一条独立规则。 */
export function selectionToRules(selection: AudienceSelection): AudienceRule[] {
  const rules: AudienceRule[] = [];
  if (selection.includeAll) {
    rules.push({
      audienceType: "all",
      departmentId: null,
      employeeId: null,
      includeChildren: false,
    });
  }
  for (const departmentId of selection.departmentIds) {
    rules.push({
      audienceType: "department",
      departmentId,
      employeeId: null,
      includeChildren: selection.includeChildren,
    });
  }
  for (const employeeId of selection.employeeIds) {
    rules.push({
      audienceType: "employee",
      departmentId: null,
      employeeId,
      includeChildren: false,
    });
  }
  return rules;
}

/** 规则数组 → 选择状态（编辑回显；容忍旧版数组形状，取首项）。 */
export function rulesToSelection(
  rules: readonly AudienceRule[] | undefined,
): AudienceSelection {
  const list = Array.isArray(rules) ? rules : [];
  const selection: AudienceSelection = {
    includeAll: false,
    departmentIds: [],
    employeeIds: [],
    includeChildren: false,
  };
  for (const rule of list) {
    if (rule.audienceType === "all") {
      selection.includeAll = true;
    } else if (rule.audienceType === "department") {
      const id = scalarOrFirst(rule.departmentId as string | null);
      if (typeof id === "string" && id.length > 0) {
        selection.departmentIds.push(id);
        if (rule.includeChildren) selection.includeChildren = true;
      }
    } else if (rule.audienceType === "employee") {
      const id = scalarOrFirst(rule.employeeId as string | null);
      if (typeof id === "string" && id.length > 0) {
        selection.employeeIds.push(id);
      }
    }
  }
  return selection;
}

/**
 * 规则数组 → 可读标签片段（依次渲染）：
 * all → "全体员工"；department → 部门名（含子部门时追加"（含子部门）"）；
 * employee → 员工名。
 */
export function formatAudienceParts(
  rules: readonly AudienceRule[] | undefined,
  names: {
    departments: Record<string, string>;
    employees: Record<string, string>;
  },
): string[] {
  const parts: string[] = [];
  for (const rule of rules ?? []) {
    if (rule.audienceType === "all") {
      parts.push("全体员工");
    } else if (rule.audienceType === "department") {
      const id = scalarOrFirst(rule.departmentId as string | null);
      if (typeof id !== "string" || id.length === 0) continue;
      const name = names.departments[id] ?? id;
      parts.push(rule.includeChildren ? `${name}（含子部门）` : name);
    } else if (rule.audienceType === "employee") {
      const id = scalarOrFirst(rule.employeeId as string | null);
      if (typeof id !== "string" || id.length === 0) continue;
      parts.push(names.employees[id] ?? id);
    }
  }
  return parts;
}
