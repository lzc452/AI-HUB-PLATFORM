import { z } from "zod";

/** AI 风险声明（6 项）。 */
export const aiRiskDeclarationSchema = z.object({
  handlesSensitiveData: z.boolean(),
  sendsDataExternally: z.boolean(),
  retainsConversations: z.boolean(),
  retentionPeriod: z.string().nullable().optional(),
  modelProviders: z
    .array(z.enum(["deepseek", "qwen", "wenxin", "hunyuan", "local", "other"]))
    .min(1, "请选择模型 / AI 提供方"),
  providerNote: z.string().nullable().optional(),
  affectsHighRiskDecisions: z.boolean(),
  inputRestrictionDisclaimer: z.string().min(1, "免责声明不能为空"),
});

export const applicationIconSchema = z
  .object({
    mode: z.enum(["auto", "upload"]),
    backgroundColor: z.string().nullable().optional(),
    /**
     * 自动模式下预览首字取自应用名称，故不再要求 text 单独输入；
     * 仅上传模式需要 icon.assetId。
     */
    text: z.string().nullable().optional(),
    assetId: z.string().nullable().optional(),
  })
  .refine(
    (icon) =>
      icon.mode === "auto"
        ? typeof icon.backgroundColor === "string" &&
          icon.backgroundColor.trim().length > 0
        : typeof icon.assetId === "string" && icon.assetId.length > 0,
    {
      message: "图标二选一：自动生成需背景色，上传模式需图标资产",
      path: ["mode"],
    },
  );

export const faqEntrySchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  answer: z.string().min(1, "回答不能为空"),
});

export const audienceRuleSchema = z
  .object({
    audienceType: z.enum(["all", "department", "employee"]),
    departmentId: z.array(z.string()).nullable().optional(),
    employeeId: z.array(z.string()).nullable().optional(),
    includeChildren: z.boolean().optional(),
  })
  .superRefine((rule, ctx) => {
    // 指定部门 / 指定员工时，对应选择必须非空（受众-必填校验）。
    if (
      rule.audienceType === "department" &&
      (!rule.departmentId || rule.departmentId.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "请至少选择一个部门",
      });
    }
    if (
      rule.audienceType === "employee" &&
      (!rule.employeeId || rule.employeeId.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["employeeId"],
        message: "请至少选择一名员工",
      });
    }
  });

/** 交付目标（与 @ai-hub/contracts DeliveryTarget 同源；提交期由后端 fail-closed 校验）。 */
export const deliveryTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("desktop"),
    os: z.enum(["windows", "macos"]),
    arch: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("mobile"),
    platform: z.enum(["android", "ios"]),
    arch: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("miniprogram"),
    platform: z.enum(["wechat", "dingtalk", "alipay"]),
    appId: z.string(),
    qrCodeAssetId: z.string(),
    versionNote: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
  }),
]);

export const deliveryDraftItemSchema = z.object({
  channel: z.enum(["web", "desktop", "mobile", "mini_program"]),
  entryUrl: z.string().nullable().optional(),
  minClientVersion: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  assetIds: z.array(z.string()).optional(),
  targets: z.array(deliveryTargetSchema).optional(),
});

/**
 * 草稿字段形状（不含提交期校验）。
 * 交付配置（deliveries）在向导内由应用类型自动派生，故在表单层为可选；
 * 后端提交时的完整性校验仍要求 deliveries 非空（见 applicationDraftSchema）。
 */
const applicationDraftShape = z.object({
  name: z.string().min(1, "应用名称不能为空").max(160, "名称不能超过 160 字"),
  departmentId: z.string().min(1, "请选择归属部门"),
  maintainerEmployeeIds: z.array(z.string()).min(1, "至少指定一名维护人"),
  categoryId: z.string().min(1, "请选择分类"),
  applicationType: z.enum([
    "web_app",
    "desktop_app",
    "mobile_app",
    "mini_program",
  ]),
  tagIds: z.array(z.string()),
  icon: applicationIconSchema,
  screenshotAssetIds: z
    .array(z.string())
    .min(1, "至少上传 1 张截图")
    .max(6, "截图最多 6 张"),
  summaryHtml: z.string().min(1, "简介不能为空"),
  manualHtml: z.string().nullable().optional(),
  manualAssetId: z.string().nullable().optional(),
  examplesHtml: z.string().nullable().optional(),
  examplesAssetId: z.string().nullable().optional(),
  faq: z.array(faqEntrySchema).optional(),
  audience: z.array(audienceRuleSchema).min(1, "受众规则至少一条"),
  risk: aiRiskDeclarationSchema,
  deliveries: z.array(deliveryDraftItemSchema).optional(),
  version: z.string().min(1, "版本号不能为空"),
  changelog: z.string().min(1, "变更说明不能为空"),
});
/** 完整草稿 schema（与后端 validateDraftCompleteness 同源规则）。 */
export const applicationDraftSchema = z
  .object({
    name: z.string().min(1, "应用名称不能为空").max(160, "名称不能超过 160 字"),
    departmentId: z.string().min(1, "请选择归属部门"),
    maintainerEmployeeIds: z.array(z.string()).min(1, "至少指定一名维护人"),
    categoryId: z.string().min(1, "请选择分类"),
    applicationType: z.enum([
      "web_app",
      "desktop_app",
      "mobile_app",
      "mini_program",
    ]),
    tagIds: z.array(z.string()),
    icon: applicationIconSchema,
    screenshotAssetIds: z
      .array(z.string())
      .min(1, "至少上传 1 张截图")
      .max(6, "截图最多 6 张"),
    summaryHtml: z.string().min(1, "简介不能为空"),
    manualHtml: z.string().nullable().optional(),
    manualAssetId: z.string().nullable().optional(),
    examplesHtml: z.string().nullable().optional(),
    examplesAssetId: z.string().nullable().optional(),
    faq: z.array(faqEntrySchema).optional(),
    audience: z.array(audienceRuleSchema).min(1, "受众规则至少一条"),
    risk: aiRiskDeclarationSchema,
    deliveries: z.array(deliveryDraftItemSchema).min(1, "交付配置不能为空"),
    version: z.string().min(1, "版本号不能为空"),
    changelog: z.string().min(1, "变更说明不能为空"),
  })
  .superRefine((draft, ctx) => {
    const hasManual =
      (typeof draft.manualHtml === "string" &&
        draft.manualHtml.trim().length > 0) ||
      (typeof draft.manualAssetId === "string" &&
        draft.manualAssetId.length > 0);
    if (!hasManual) {
      ctx.addIssue({
        code: "custom",
        path: ["manualHtml"],
        message: "操作手册需提供富文本或附件",
      });
    }
    const hasExamples =
      (typeof draft.examplesHtml === "string" &&
        draft.examplesHtml.trim().length > 0) ||
      (typeof draft.examplesAssetId === "string" &&
        draft.examplesAssetId.length > 0);
    if (!hasExamples) {
      ctx.addIssue({
        code: "custom",
        path: ["examplesHtml"],
        message: "使用示例需提供富文本或附件",
      });
    }
  });

/** 操作手册 / 使用示例：富文本或附件二选一。 */
const refineManualExamples = (
  draft: z.infer<typeof applicationDraftShape>,
  ctx: z.RefinementCtx,
) => {
  const hasManual =
    (typeof draft.manualHtml === "string" &&
      draft.manualHtml.trim().length > 0) ||
    (typeof draft.manualAssetId === "string" && draft.manualAssetId.length > 0);
  if (!hasManual) {
    ctx.addIssue({
      code: "custom",
      path: ["manualHtml"],
      message: "操作手册需提供富文本或附件",
    });
  }
  const hasExamples =
    (typeof draft.examplesHtml === "string" &&
      draft.examplesHtml.trim().length > 0) ||
    (typeof draft.examplesAssetId === "string" &&
      draft.examplesAssetId.length > 0);
  if (!hasExamples) {
    ctx.addIssue({
      code: "custom",
      path: ["examplesHtml"],
      message: "使用示例需提供富文本或附件",
    });
  }
};

/** 表单层 schema（deliveries 可选，由向导自动派生）。供前端分步校验使用。 */
export const applicationDraftFormSchema =
  applicationDraftShape.superRefine(refineManualExamples);

export type ApplicationDraftFormValues = z.infer<
  typeof applicationDraftFormSchema
>;

/** 新建草稿的默认值。 */
export const applicationDraftDefaults: ApplicationDraftFormValues = {
  name: "",
  departmentId: "",
  maintainerEmployeeIds: [],
  categoryId: "",
  applicationType: "web_app",
  tagIds: [],
  icon: { mode: "auto", backgroundColor: "#185FA5", text: "", assetId: null },
  screenshotAssetIds: [],
  summaryHtml: "",
  manualHtml: "",
  manualAssetId: null,
  examplesHtml: "",
  examplesAssetId: null,
  faq: [],
  audience: [
    {
      audienceType: "all",
      departmentId: null,
      employeeId: null,
      includeChildren: false,
    },
  ],
  risk: {
    handlesSensitiveData: false,
    sendsDataExternally: false,
    retainsConversations: false,
    retentionPeriod: null,
    modelProviders: [],
    providerNote: null,
    affectsHighRiskDecisions: false,
    inputRestrictionDisclaimer: "",
  },
  deliveries: [],
  version: "1.0.0",
  changelog: "",
};

/** 根据应用类型派生交付配置（向导内不手工配渠道，发布时用独立交付页配置）。 */
export function defaultDeliveriesForType(applicationType: string): Array<{
  channel: "web" | "desktop" | "mobile" | "mini_program";
  entryUrl: string | null;
  minClientVersion: string | null;
  enabled: boolean;
  assetIds: string[];
}> {
  const channel =
    applicationType === "web_app"
      ? "web"
      : applicationType === "desktop_app"
        ? "desktop"
        : applicationType === "mobile_app"
          ? "mobile"
          : "mini_program";
  return [
    {
      channel: channel as "web" | "desktop" | "mobile" | "mini_program",
      entryUrl: null,
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    },
  ];
}
