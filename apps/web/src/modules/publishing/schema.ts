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
    text: z.string().nullable().optional(),
    assetId: z.string().nullable().optional(),
  })
  .refine(
    (icon) =>
      icon.mode === "auto"
        ? typeof icon.text === "string" && icon.text.length > 0
        : typeof icon.assetId === "string" && icon.assetId.length > 0,
    {
      message: "图标二选一：自动模式需字符，上传模式需图标资产",
      path: ["mode"],
    },
  );

export const faqEntrySchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  answer: z.string().min(1, "回答不能为空"),
});

export const audienceRuleSchema = z.object({
  audienceType: z.enum(["all", "department", "employee"]),
  departmentId: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  includeChildren: z.boolean().optional(),
});

export const deliveryDraftItemSchema = z.object({
  channel: z.enum(["web", "desktop", "mobile", "mini_program"]),
  entryUrl: z.string().nullable().optional(),
  minClientVersion: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  assetIds: z.array(z.string()).optional(),
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

export type ApplicationDraftFormValues = z.infer<typeof applicationDraftSchema>;

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
  manualHtml: null,
  manualAssetId: null,
  examplesHtml: null,
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
