import { describe, expect, it } from "vitest";

import type { AudienceRule } from "@ai-hub/contracts";

import {
  formatAudienceParts,
  rulesToSelection,
  selectionToRules,
} from "./audience";

const allRule: AudienceRule = {
  audienceType: "all",
  departmentId: null,
  employeeId: null,
  includeChildren: false,
};

describe("selectionToRules（多选生成多条规则）", () => {
  it("全体员工开关生成一条 all 规则", () => {
    expect(
      selectionToRules({
        includeAll: true,
        departmentIds: [],
        employeeIds: [],
        includeChildren: false,
      }),
    ).toEqual([allRule]);
  });

  it("每个部门生成一条 department 规则，包含子部门只落在部门规则上", () => {
    expect(
      selectionToRules({
        includeAll: false,
        departmentIds: ["dept-rnd", "dept-ops"],
        employeeIds: [],
        includeChildren: true,
      }),
    ).toEqual([
      {
        audienceType: "department",
        departmentId: "dept-rnd",
        employeeId: null,
        includeChildren: true,
      },
      {
        audienceType: "department",
        departmentId: "dept-ops",
        employeeId: null,
        includeChildren: true,
      },
    ]);
  });

  it("每名员工生成一条 employee 规则", () => {
    expect(
      selectionToRules({
        includeAll: false,
        departmentIds: [],
        employeeIds: ["E100", "E200"],
        includeChildren: false,
      }),
    ).toEqual([
      {
        audienceType: "employee",
        departmentId: null,
        employeeId: "E100",
        includeChildren: false,
      },
      {
        audienceType: "employee",
        departmentId: null,
        employeeId: "E200",
        includeChildren: false,
      },
    ]);
  });

  it("all + 部门 + 员工组合生成全部规则", () => {
    const rules = selectionToRules({
      includeAll: true,
      departmentIds: ["dept-rnd"],
      employeeIds: ["E100"],
      includeChildren: false,
    });
    expect(rules).toHaveLength(3);
    expect(rules).toEqual([
      allRule,
      {
        audienceType: "department",
        departmentId: "dept-rnd",
        employeeId: null,
        includeChildren: false,
      },
      {
        audienceType: "employee",
        departmentId: null,
        employeeId: "E100",
        includeChildren: false,
      },
    ]);
  });

  it("全部不选时返回空数组（由表单 min(1) 拦截）", () => {
    expect(
      selectionToRules({
        includeAll: false,
        departmentIds: [],
        employeeIds: [],
        includeChildren: false,
      }),
    ).toEqual([]);
  });
});

describe("rulesToSelection（编辑回显反解）", () => {
  it("多条规则反解为 UI 选择状态", () => {
    expect(
      rulesToSelection([
        allRule,
        {
          audienceType: "department",
          departmentId: "dept-rnd",
          employeeId: null,
          includeChildren: true,
        },
        {
          audienceType: "employee",
          departmentId: null,
          employeeId: "E100",
          includeChildren: false,
        },
      ]),
    ).toEqual({
      includeAll: true,
      departmentIds: ["dept-rnd"],
      employeeIds: ["E100"],
      includeChildren: true,
    });
  });

  it("容忍历史草稿的数组形状受众值（取首项）", () => {
    const legacy = [
      {
        audienceType: "department",
        departmentId: ["dept-rnd"],
        employeeId: null,
        includeChildren: false,
      },
      {
        audienceType: "employee",
        departmentId: null,
        employeeId: ["E100"],
        includeChildren: false,
      },
    ] as unknown as AudienceRule[];
    expect(rulesToSelection(legacy)).toEqual({
      includeAll: false,
      departmentIds: ["dept-rnd"],
      employeeIds: ["E100"],
      includeChildren: false,
    });
  });

  it("空值 / 空数组安全降级", () => {
    expect(rulesToSelection(undefined)).toEqual({
      includeAll: false,
      departmentIds: [],
      employeeIds: [],
      includeChildren: false,
    });
    expect(rulesToSelection([])).toEqual({
      includeAll: false,
      departmentIds: [],
      employeeIds: [],
      includeChildren: false,
    });
  });
});

describe("formatAudienceParts（标签渲染）", () => {
  const names = {
    departments: { "dept-rnd": "研发部", "dept-ops": "运营部" },
    employees: { E100: "张三", E200: "李四" },
  };

  it("all → 全体员工", () => {
    expect(formatAudienceParts([allRule], names)).toEqual(["全体员工"]);
  });

  it("部门规则 → 部门名，含子部门追加标注", () => {
    expect(
      formatAudienceParts(
        [
          {
            audienceType: "department",
            departmentId: "dept-rnd",
            employeeId: null,
            includeChildren: true,
          },
        ],
        names,
      ),
    ).toEqual(["研发部（含子部门）"]);
  });

  it("多条规则依次渲染：all + 部门 + 员工", () => {
    expect(
      formatAudienceParts(
        [
          allRule,
          {
            audienceType: "department",
            departmentId: "dept-rnd",
            employeeId: null,
            includeChildren: true,
          },
          {
            audienceType: "employee",
            departmentId: null,
            employeeId: "E100",
            includeChildren: false,
          },
        ],
        names,
      ),
    ).toEqual(["全体员工", "研发部（含子部门）", "张三"]);
  });

  it("未知 id 回退显示原始 id", () => {
    expect(
      formatAudienceParts(
        [
          {
            audienceType: "department",
            departmentId: "dept-unknown",
            employeeId: null,
            includeChildren: false,
          },
        ],
        names,
      ),
    ).toEqual(["dept-unknown"]);
  });
});
