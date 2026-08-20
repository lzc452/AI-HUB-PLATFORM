import { describe, expect, it } from "vitest";

import {
  applicationDraftDefaults,
  applicationDraftFormSchema,
  audienceRuleSchema,
  deliveryDraftItemSchema,
  deriveApplicationTypeFromChannels,
  deriveDeliveriesFromChannels,
} from "./schema";

/** 完整表单值（除 deliveries 外全部必填），供多选交付逐渠道校验用例使用。 */
function completeForm(): Record<string, unknown> {
  return {
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
    faq: [{ question: "如何重置密码？", answer: "联系管理员" }],
    audience: [
      {
        audienceType: "all",
        departmentId: null,
        employeeId: null,
        includeChildren: false,
      },
    ],
  };
}

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

describe("分类与自定义分类至少填一个；自定义标签名可多填（功能 5b）", () => {
  it("categoryId 为空但 customCategoryName 有值时通过", () => {
    const result = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      categoryId: "",
      customCategoryName: "我的分类",
    });
    expect(result.success).toBe(true);
  });

  it("categoryId 与 customCategoryName 均为空时失败（请选择分类）", () => {
    const result = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      categoryId: "",
      customCategoryName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message === "请选择分类"),
      ).toBe(true);
    }
  });

  it("缺失 categoryId 仅提供 customCategoryName 也通过", () => {
    const { categoryId: _omitted, ...withoutCategoryId } = completeForm();
    const result = applicationDraftFormSchema.safeParse({
      ...withoutCategoryId,
      customCategoryName: "我的分类",
    });
    expect(result.success).toBe(true);
    expect(_omitted).toBe("cat-1");
  });

  it("自定义标签名可多填，与既有 tagIds 共存", () => {
    const result = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      customTagNames: ["效率", "助手"],
    });
    expect(result.success).toBe(true);
  });

  it("自定义分类/标签名超 120 字拒绝（与 DB varchar(120) 一致）", () => {
    const overlong = "超".repeat(121);
    const category = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      categoryId: "",
      customCategoryName: overlong,
    });
    expect(category.success).toBe(false);
    if (!category.success) {
      expect(
        category.error.issues.some(
          (issue) => issue.message === "自定义分类名称不能超过 120 字",
        ),
      ).toBe(true);
    }

    const tag = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      customTagNames: ["x".repeat(120), overlong],
    });
    expect(tag.success).toBe(false);
    if (!tag.success) {
      expect(
        tag.error.issues.some(
          (issue) => issue.message === "自定义标签名称不能超过 120 字",
        ),
      ).toBe(true);
    }
  });

  it("恰好 120 字的自定义分类/标签名通过", () => {
    const boundary = "界".repeat(120);
    const result = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      categoryId: "",
      customCategoryName: boundary,
      customTagNames: [boundary],
    });
    expect(result.success).toBe(true);
  });
});

describe("deliveryDraftItemSchema（多选交付逐渠道必填校验）", () => {
  it("web 渠道缺 entryUrl（null / 空串）时校验失败", () => {
    const base = {
      channel: "web" as const,
      minClientVersion: null,
      enabled: true,
      assetIds: [] as string[],
    };
    const nullResult = deliveryDraftItemSchema.safeParse({
      ...base,
      entryUrl: null,
    });
    expect(nullResult.success).toBe(false);
    const emptyResult = deliveryDraftItemSchema.safeParse({
      ...base,
      entryUrl: "",
    });
    expect(emptyResult.success).toBe(false);
    if (!nullResult.success) {
      expect(
        nullResult.error.issues.some(
          (issue) => issue.message === "Web 渠道需填写入口地址",
        ),
      ).toBe(true);
    }
  });

  it("desktop 渠道缺 targets 时校验失败", () => {
    const result = deliveryDraftItemSchema.safeParse({
      channel: "desktop",
      entryUrl: null,
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.message === "请至少选择一个目标系统/平台",
        ),
      ).toBe(true);
    }
  });

  it("mobile 渠道缺 targets 时校验失败", () => {
    const result = deliveryDraftItemSchema.safeParse({
      channel: "mobile",
      entryUrl: null,
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.message === "请至少选择一个目标系统/平台",
        ),
      ).toBe(true);
    }
  });

  it("mini_program 渠道无额外必填（entryUrl 可空、无 targets 通过）", () => {
    const result = deliveryDraftItemSchema.safeParse({
      channel: "mini_program",
      entryUrl: null,
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("web 渠道填写 entryUrl、desktop 渠道填写 targets 后通过", () => {
    const web = deliveryDraftItemSchema.safeParse({
      channel: "web",
      entryUrl: "https://apps.example.com",
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    });
    expect(web.success).toBe(true);
    const desktop = deliveryDraftItemSchema.safeParse({
      channel: "desktop",
      entryUrl: null,
      minClientVersion: null,
      enabled: true,
      assetIds: [],
      targets: [{ kind: "desktop", os: "windows", arch: null }],
    });
    expect(desktop.success).toBe(true);
  });

  it("多选交付渠道时逐渠道校验必填：web 缺 entryUrl 失败、desktop 缺 targets 失败", () => {
    const result = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      deliveries: [
        {
          channel: "web",
          entryUrl: null,
          minClientVersion: null,
          enabled: true,
          assetIds: [],
        },
        {
          channel: "desktop",
          entryUrl: null,
          minClientVersion: null,
          enabled: true,
          assetIds: [],
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain("Web 渠道需填写入口地址");
      expect(messages).toContain("请至少选择一个目标系统/平台");
    }
  });

  it("多选渠道各自填写必填项后整体通过（web + desktop + mini_program）", () => {
    const result = applicationDraftFormSchema.safeParse({
      ...completeForm(),
      deliveries: [
        {
          channel: "web",
          entryUrl: "https://apps.example.com",
          minClientVersion: null,
          enabled: true,
          assetIds: [],
        },
        {
          channel: "desktop",
          entryUrl: null,
          minClientVersion: null,
          enabled: true,
          assetIds: [],
          targets: [{ kind: "desktop", os: "windows", arch: null }],
        },
        {
          channel: "mini_program",
          entryUrl: null,
          minClientVersion: null,
          enabled: true,
          assetIds: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("deriveDeliveriesFromChannels / deriveApplicationTypeFromChannels", () => {
  it("按选择派生逐渠道草稿项：web→entryUrl 空串待填、desktop/mobile→空 targets、mini_program→空 entryUrl", () => {
    expect(
      deriveDeliveriesFromChannels([
        "web",
        "desktop",
        "mobile",
        "mini_program",
      ]),
    ).toEqual([
      {
        channel: "web",
        entryUrl: "",
        minClientVersion: null,
        enabled: true,
        assetIds: [],
      },
      {
        channel: "desktop",
        entryUrl: null,
        minClientVersion: null,
        enabled: true,
        assetIds: [],
        targets: [],
      },
      {
        channel: "mobile",
        entryUrl: null,
        minClientVersion: null,
        enabled: true,
        assetIds: [],
        targets: [],
      },
      {
        channel: "mini_program",
        entryUrl: null,
        minClientVersion: null,
        enabled: true,
        assetIds: [],
      },
    ]);
  });

  it("空选择派生为空数组", () => {
    expect(deriveDeliveriesFromChannels([])).toEqual([]);
  });

  it("单渠道映射应用类型与旧 defaultDeliveriesForType 一致", () => {
    expect(deriveApplicationTypeFromChannels(["web"])).toBe("web_app");
    expect(deriveApplicationTypeFromChannels(["desktop"])).toBe("desktop_app");
    expect(deriveApplicationTypeFromChannels(["mobile"])).toBe("mobile_app");
    expect(deriveApplicationTypeFromChannels(["mini_program"])).toBe(
      "mini_program",
    );
  });

  it("多渠道时优先 desktop/mobile：安装包制品门禁保持生效", () => {
    expect(deriveApplicationTypeFromChannels(["web", "desktop"])).toBe(
      "desktop_app",
    );
    expect(deriveApplicationTypeFromChannels(["mobile", "web"])).toBe(
      "mobile_app",
    );
    expect(deriveApplicationTypeFromChannels(["web", "mini_program"])).toBe(
      "mini_program",
    );
  });
});
