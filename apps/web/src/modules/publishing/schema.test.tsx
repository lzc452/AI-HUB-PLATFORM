import { describe, expect, it } from "vitest";

import {
  applicationDraftDefaults,
  applicationDraftFormSchema,
  audienceRuleSchema,
} from "./schema";

describe("audienceRuleSchema（单值规则，与契约 AudienceRule 同源）", () => {
  it("all 规则（标量 null）通过", () => {
    expect(
      audienceRuleSchema.parse({
        audienceType: "all",
        departmentId: null,
        employeeId: null,
        includeChildren: false,
      }),
    ).toEqual({
      audienceType: "all",
      departmentId: null,
      employeeId: null,
      includeChildren: false,
    });
  });

  it("department 规则要求单值字符串 departmentId", () => {
    const parsed = audienceRuleSchema.parse({
      audienceType: "department",
      departmentId: "dept-rnd",
      employeeId: null,
      includeChildren: true,
    });
    expect(parsed.departmentId).toBe("dept-rnd");
  });

  it("employee 规则要求单值字符串 employeeId", () => {
    const parsed = audienceRuleSchema.parse({
      audienceType: "employee",
      departmentId: null,
      employeeId: "E100",
      includeChildren: false,
    });
    expect(parsed.employeeId).toBe("E100");
  });

  it("数组形状的 departmentId 被拒绝（旧版 bug 形状）", () => {
    const result = audienceRuleSchema.safeParse({
      audienceType: "department",
      departmentId: ["dept-rnd"],
      employeeId: null,
      includeChildren: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("departmentId");
    }
  });

  it("department 规则缺少部门值时报错", () => {
    const result = audienceRuleSchema.safeParse({
      audienceType: "department",
      departmentId: null,
      employeeId: null,
      includeChildren: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message === "请选择部门"),
      ).toBe(true);
    }
  });

  it("employee 规则缺少员工值时报错", () => {
    const result = audienceRuleSchema.safeParse({
      audienceType: "employee",
      departmentId: null,
      employeeId: "",
      includeChildren: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message === "请选择员工"),
      ).toBe(true);
    }
  });
});

describe("applicationDraftFormSchema（受众为多条规则数组）", () => {
  it("默认受众（单条 all 规则）通过规则校验", () => {
    const result = audienceRuleSchema
      .array()
      .min(1)
      .safeParse(applicationDraftDefaults.audience);
    expect(result.success).toBe(true);
  });

  it("多选生成的多条规则通过受众校验", () => {
    const result = audienceRuleSchema.array().safeParse([
      {
        audienceType: "all",
        departmentId: null,
        employeeId: null,
        includeChildren: false,
      },
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
      {
        audienceType: "employee",
        departmentId: null,
        employeeId: "E100",
        includeChildren: false,
      },
    ]);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toHaveLength(4);
  });

  it("空受众数组被 min(1) 拒绝", () => {
    const result = audienceRuleSchema.array().min(1).safeParse([]);
    expect(result.success).toBe(false);
  });

  it("faq 必填：空数组 / 缺失均被拒绝，至少一条通过", () => {
    const base = {
      ...applicationDraftDefaults,
      name: "智能考勤助手",
      manualHtml: "<p>手册</p>",
      examplesHtml: "<p>示例</p>",
      screenshotAssetIds: ["asset-1"],
      summaryHtml: "<p>简介</p>",
      departmentId: "dept-rnd",
      risk: {
        ...applicationDraftDefaults.risk,
        modelProviders: ["local"],
        inputRestrictionDisclaimer: "请勿输入敏感信息",
      },
      maintainerEmployeeIds: ["E100"],
      categoryId: "cat-1",
      version: "1.0.0",
      changelog: "首次发布",
      audience: [
        {
          audienceType: "all",
          departmentId: null,
          employeeId: null,
          includeChildren: false,
        },
      ],
      deliveries: [
        {
          channel: "web",
          entryUrl: "https://apps.example.com",
          minClientVersion: null,
          enabled: true,
          assetIds: [],
        },
      ],
    };
    // 空数组被 min(1) 拒绝。
    const emptyResult = applicationDraftFormSchema.safeParse({
      ...base,
      faq: [],
    });
    expect(emptyResult.success).toBe(false);
    if (!emptyResult.success) {
      expect(
        emptyResult.error.issues.some(
          (issue) => issue.message === "至少填写一条常见问题",
        ),
      ).toBe(true);
    }
    // 缺失 faq（旧草稿）经 default([]) 后同样被 min(1) 拒绝。
    const missingResult = applicationDraftFormSchema.safeParse({
      ...base,
      faq: undefined,
    });
    expect(missingResult.success).toBe(false);
    // 至少一条问题/回答通过。
    const filled = applicationDraftFormSchema.safeParse({
      ...base,
      faq: [{ question: "如何重置密码？", answer: "联系管理员" }],
    });
    expect(filled.success).toBe(true);
  });

  it("完整表单携带多部门受众可整体通过（补全其余必填字段）", () => {
    const complete = {
      ...applicationDraftDefaults,
      name: "智能考勤助手",
      manualHtml: "<p>手册</p>",
      examplesHtml: "<p>示例</p>",
      screenshotAssetIds: ["asset-1"],
      faq: [{ question: "如何重置密码？", answer: "联系管理员" }],
      icon: {
        mode: "auto",
        backgroundColor: "#185FA5",
        text: "",
        assetId: null,
      },
      summaryHtml: "<p>简介</p>",
      departmentId: "dept-rnd",
      risk: {
        ...applicationDraftDefaults.risk,
        modelProviders: ["local"],
        inputRestrictionDisclaimer: "请勿输入敏感信息",
      },
      maintainerEmployeeIds: ["E100"],
      categoryId: "cat-1",
      version: "1.0.0",
      changelog: "首次发布",
      audience: [
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
          includeChildren: false,
        },
      ],
      deliveries: [
        {
          channel: "web",
          entryUrl: "https://apps.example.com",
          minClientVersion: null,
          enabled: true,
          assetIds: [],
        },
      ],
    };
    const result = applicationDraftFormSchema.safeParse(complete);
    expect(result.success).toBe(true);
  });
});
