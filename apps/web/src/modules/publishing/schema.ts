import { z } from "zod";
import type { DeliveryChannel, DeliveryDraftItem } from "@ai-hub/contracts";

const deliveryChannelEnum = z.enum([
  "web",
  "desktop",
  "mobile",
  "mini_program",
]);

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

/**
 * 单条受众规则（与 @ai-hub/contracts AudienceRule 同源）：
 * 每条规则只承载一个部门或一名员工（标量），受众整体是「多条规则数组」——
 * 全体员工一条 all 规则、每个部门一条 department 规则、每名员工一条 employee 规则。
 * 后端 application_audiences 为每规则一行（标量列），数组形状会导致 Postgres 类型错误。
 */
export const audienceRuleSchema = z
  .object({
    audienceType: z.enum(["all", "department", "employee"]),
    departmentId: z.string().nullable(),
    employeeId: z.string().nullable(),
    includeChildren: z.boolean(),
  })
  .superRefine((rule, ctx) => {
    // 指定部门 / 指定员工时，对应值必须非空（受众-必填校验）。
    if (
      rule.audienceType === "department" &&
      (typeof rule.departmentId !== "string" || rule.departmentId.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "请选择部门",
      });
    }
    if (
      rule.audienceType === "employee" &&
      (typeof rule.employeeId !== "string" || rule.employeeId.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["employeeId"],
        message: "请选择员工",
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

/**
 * 单条交付配置（多选渠道）：按 channel 逐渠道校验必填——
 * web 需入口地址；desktop/mobile 需 ≥1 个目标；mini_program 无额外必填
 * （目标完整性由发布门禁 fail-closed 兜底）。
 */
export const deliveryDraftItemSchema = z
  .object({
    channel: deliveryChannelEnum,
    entryUrl: z.string().nullable().optional(),
    minClientVersion: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    assetIds: z.array(z.string()).optional(),
    targets: z.array(deliveryTargetSchema).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.channel === "web") {
      if (
        typeof item.entryUrl !== "string" ||
        item.entryUrl.trim().length === 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["entryUrl"],
          message: "Web 渠道需填写入口地址",
        });
      }
    }
    if (item.channel === "desktop" || item.channel === "mobile") {
      if (!Array.isArray(item.targets) || item.targets.length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["targets"],
          message: "请至少选择一个目标系统/平台",
        });
      }
    }
  });

/**
 * 草稿字段形状（不含提交期校验）。
 * 交付配置（deliveries）在向导内由「交付渠道多选」（deliveryChannels）派生，
 * 故在表单层为可选；后端提交时的完整性校验仍要求 deliveries 非空
 * （见 applicationDraftSchema）。
 * faq 为规格 §5.4 必填项：optional + refine 让缺失 faq 的旧草稿（undefined）
 * 在回显时显示空列表可编辑，校验（下一步/提交）时按 min(1) 报错 ——
 * 必填只在校验时生效。
 */
const applicationDraftShape = z.object({
  name: z.string().min(1, "应用名称不能为空").max(160, "名称不能超过 160 字"),
  departmentId: z.string().min(1, "请选择归属部门"),
  maintainerEmployeeIds: z.array(z.string()).min(1, "至少指定一名维护人"),
  categoryId: z.string().optional(),
  applicationType: z.enum([
    "web_app",
    "desktop_app",
    "mobile_app",
    "mini_program",
  ]),
  tagIds: z.array(z.string()),
  /** 自定义分类名称（未匹配现有分类时填写；categoryId 为空；与 DB varchar(120) 一致）。 */
  customCategoryName: z
    .string()
    .max(120, "自定义分类名称不能超过 120 字")
    .optional(),
  /** 自定义标签名称列表（未匹配现有标签的部分）。 */
  customTagNames: z
    .array(z.string().max(120, "自定义标签名称不能超过 120 字"))
    .optional(),
  icon: applicationIconSchema,
  screenshotAssetIds: z
    .array(z.string())
    .min(1, "至少上传 1 张截图")
    .max(6, "截图最多 6 张"),
  attachmentAssetIds: z.array(z.string()).max(10, "附件最多 10 个").optional(),
  summaryHtml: z.string().min(1, "简介不能为空"),
  manualHtml: z.string().nullable().optional(),
  manualAssetId: z.string().nullable().optional(),
  examplesHtml: z.string().nullable().optional(),
  examplesAssetId: z.string().nullable().optional(),
  faq: z
    .array(faqEntrySchema)
    .min(1, "至少填写一条常见问题")
    .optional()
    .refine((value) => value !== undefined && value.length > 0, {
      message: "至少填写一条常见问题",
    }),
  audience: z.array(audienceRuleSchema).min(1, "受众规则至少一条"),
  risk: aiRiskDeclarationSchema,
  deliveries: z.array(deliveryDraftItemSchema).optional(),
  /** 向导内交付渠道多选（deliveries 的派生源）；表单层可选。 */
  deliveryChannels: z.array(deliveryChannelEnum).optional(),
  version: z.string().min(1, "版本号不能为空"),
  changelog: z.string().min(1, "变更说明不能为空"),
});

/** 分类：选择现有分类（categoryId）或输入自定义名称（customCategoryName）至少一个非空（功能 5b）。 */
const refineCategoryOrCustom = (
  draft: {
    categoryId?: string | undefined;
    customCategoryName?: string | undefined;
  },
  ctx: z.RefinementCtx,
) => {
  const hasCategoryId =
    typeof draft.categoryId === "string" && draft.categoryId.trim().length > 0;
  const hasCustomName =
    typeof draft.customCategoryName === "string" &&
    draft.customCategoryName.trim().length > 0;
  if (!hasCategoryId && !hasCustomName) {
    ctx.addIssue({
      code: "custom",
      path: ["categoryId"],
      message: "请选择分类",
    });
  }
};

/** 完整草稿 schema（与后端 validateDraftCompleteness 同源规则）。 */
export const applicationDraftSchema = z
  .object({
    name: z.string().min(1, "应用名称不能为空").max(160, "名称不能超过 160 字"),
    departmentId: z.string().min(1, "请选择归属部门"),
    maintainerEmployeeIds: z.array(z.string()).min(1, "至少指定一名维护人"),
    categoryId: z.string().optional(),
    applicationType: z.enum([
      "web_app",
      "desktop_app",
      "mobile_app",
      "mini_program",
    ]),
    tagIds: z.array(z.string()),
    /** 自定义分类名称（未匹配现有分类时填写；categoryId 为空；与 DB varchar(120) 一致）。 */
    customCategoryName: z
      .string()
      .max(120, "自定义分类名称不能超过 120 字")
      .optional(),
    /** 自定义标签名称列表（未匹配现有标签的部分）。 */
    customTagNames: z
      .array(z.string().max(120, "自定义标签名称不能超过 120 字"))
      .optional(),
    icon: applicationIconSchema,
    screenshotAssetIds: z
      .array(z.string())
      .min(1, "至少上传 1 张截图")
      .max(6, "截图最多 6 张"),
    attachmentAssetIds: z
      .array(z.string())
      .max(10, "附件最多 10 个")
      .optional(),
    summaryHtml: z.string().min(1, "简介不能为空"),
    manualHtml: z.string().nullable().optional(),
    manualAssetId: z.string().nullable().optional(),
    examplesHtml: z.string().nullable().optional(),
    examplesAssetId: z.string().nullable().optional(),
    faq: z
      .array(faqEntrySchema)
      .min(1, "至少填写一条常见问题")
      .optional()
      .refine((value) => value !== undefined && value.length > 0, {
        message: "至少填写一条常见问题",
      }),
    audience: z.array(audienceRuleSchema).min(1, "受众规则至少一条"),
    risk: aiRiskDeclarationSchema,
    deliveries: z.array(deliveryDraftItemSchema).min(1, "交付配置不能为空"),
    deliveryChannels: z.array(deliveryChannelEnum).optional(),
    version: z.string().min(1, "版本号不能为空"),
    changelog: z.string().min(1, "变更说明不能为空"),
  })
  .superRefine(refineCategoryOrCustom)
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
export const applicationDraftFormSchema = applicationDraftShape
  .superRefine(refineCategoryOrCustom)
  .superRefine(refineManualExamples);

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
  attachmentAssetIds: [],
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
  deliveryChannels: [],
  version: "1.0.0",
  changelog: "",
};

/**
 * 按所选交付渠道派生草稿交付项（功能 4：向导多选渠道）。
 * - web：entryUrl 空字符串待填（逐渠道必填校验要求非空）
 * - desktop / mobile：targets 空数组待填（逐渠道必填校验要求 ≥1 个目标）
 * - mini_program：无额外必填，保持空 entryUrl
 * 各渠道数据（entryUrl / targets）随后由向导内对应编辑器填写。
 */
export function deriveDeliveriesFromChannels(
  selectedChannels: readonly DeliveryChannel[],
): DeliveryDraftItem[] {
  return selectedChannels.map((channel) => {
    const base: DeliveryDraftItem = {
      channel,
      entryUrl: null,
      minClientVersion: null,
      enabled: true,
      assetIds: [],
    };
    if (channel === "web") {
      return { ...base, entryUrl: "" };
    }
    if (channel === "desktop" || channel === "mobile") {
      return { ...base, targets: [] };
    }
    return base;
  });
}

/**
 * 由所选交付渠道派生应用类型（向导内不再单独选择应用类型）：
 * 包含 desktop/mobile 渠道时映射为对应类型，保证安装包制品门禁
 * （ARTIFACT_REQUIRED_FOR_DELIVERY_TYPE）保持生效；单渠道映射与旧
 * defaultDeliveriesForType 一致；空选择回退 web_app。
 */
export function deriveApplicationTypeFromChannels(
  channels: readonly DeliveryChannel[],
): "web_app" | "desktop_app" | "mobile_app" | "mini_program" {
  if (channels.includes("desktop")) return "desktop_app";
  if (channels.includes("mobile")) return "mobile_app";
  if (channels.includes("mini_program")) return "mini_program";
  return "web_app";
}
