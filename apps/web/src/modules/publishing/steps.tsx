import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { FieldValues } from "react-hook-form";
import {
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Switch,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type {
  AudienceRule,
  DeliveryChannel,
  DeliveryDraftItem,
} from "@ai-hub/contracts";
import { useDepartmentMembers } from "../auth";
import type { WizardStepConfig } from "../../shared/forms/FormWizard";
import { RichTextEditor } from "../../shared/ui/RichTextEditor";
import { RichTextView } from "../../shared/ui/RichTextView";
import { getAssetContent, useAssetImage } from "../application";
import {
  formatAudienceParts,
  rulesToSelection,
  selectionToRules,
  type AudienceSelection,
} from "./audience";
import {
  deriveApplicationTypeFromChannels,
  deriveDeliveriesFromChannels,
} from "./schema";
import { deleteAsset, uploadAsset } from "./publishing.client";

const { Text } = Typography;

/** 输入控件统一宽度（单行）。 */
const CONTROL_STYLE: React.CSSProperties = { width: 480 };
/** 多行文本宽度（需求：Textarea 480px）。 */
const TEXTAREA_STYLE: React.CSSProperties = { width: 480 };

/**
 * tags 模式分类值归一化（功能 5b）：表单存单一字符串（现有分类 id 或自定义名称），
 * antd tags 控件值为单元素数组（maxCount=1 时仍为数组形态）。
 */
const categoryValueToTags = (value: unknown): string[] =>
  typeof value === "string" && value.length > 0 ? [value] : [];
const categoryTagsToValue = (tags: string[]): string => tags[0] ?? "";

const APPLICATION_TYPE_LABELS: Record<string, string> = {
  web_app: "Web 应用",
  desktop_app: "桌面端应用",
  mobile_app: "移动端应用",
  mini_program: "小程序",
};

const CHANNEL_LABELS: Record<string, string> = {
  web: "Web 渠道",
  desktop: "桌面端渠道",
  mobile: "移动端渠道",
  mini_program: "小程序渠道",
};

/** 交付渠道多选选项（功能 4：交付配置按渠道多选，不再按应用类型单选）。 */
const DELIVERY_CHANNEL_OPTIONS: Array<{
  value: DeliveryChannel;
  label: string;
}> = [
  { value: "web", label: "Web 渠道" },
  { value: "desktop", label: "桌面端渠道" },
  { value: "mobile", label: "移动端渠道" },
  { value: "mini_program", label: "小程序渠道" },
];

const DESKTOP_OS_LABELS: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
};

const MOBILE_PLATFORM_LABELS: Record<string, string> = {
  android: "Android",
  ios: "iOS",
};

const MINI_PROGRAM_LABELS: Record<string, string> = {
  wechat: "微信",
  dingtalk: "钉钉",
  alipay: "支付宝",
};

const MINI_PROGRAM_PLATFORMS: ReadonlyArray<{
  value: "wechat" | "dingtalk" | "alipay";
  label: string;
}> = [
  { value: "wechat", label: "微信" },
  { value: "dingtalk", label: "钉钉" },
  { value: "alipay", label: "支付宝" },
];

/** 表单内的交付目标形状（与后端 DeliveryTarget 对齐，宽松便于分步编辑）。 */
type TargetLike = {
  kind: "desktop" | "mobile" | "miniprogram";
  os?: "windows" | "macos";
  platform?: "android" | "ios" | "wechat" | "dingtalk" | "alipay";
  arch?: string | null;
  appId?: string;
  qrCodeAssetId?: string;
  versionNote?: string | null;
  enabled?: boolean;
};

const DESKTOP_OS_OPTIONS = [
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
];

const MOBILE_PLATFORM_OPTIONS = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iOS" },
];

// ---------------------------------------------------------------------------
// 数据源（由页面层注入）
// ---------------------------------------------------------------------------

export interface PublishingOptions {
  departments: readonly { value: string; label: string }[];
  categories: readonly { value: string; label: string }[];
  tags: readonly { value: string; label: string }[];
  employees: readonly { value: string; label: string }[];
}

const AI_PROVIDER_OPTIONS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "qwen", label: "通义千问" },
  { value: "wenxin", label: "文心一言" },
  { value: "hunyuan", label: "腾讯混元" },
  { value: "local", label: "本地部署" },
  { value: "other", label: "其他" },
];

const DISCLAIMER_TEMPLATE =
  "本应用仅供企业内部使用。请勿输入超出工作所需的个人信息或敏感数据；输出内容仅供参考，不作为人事、财务、法务等决策的唯一依据。";

// ---------------------------------------------------------------------------
// 图标 / 截图上传（对接统一上传 client）
// ---------------------------------------------------------------------------

function IconField({ applicationId }: { applicationId: string }) {
  const { control, watch, setValue, trigger } = useFormContext<FieldValues>();
  const mode = watch("icon.mode");
  const name = watch("name");
  const bg = watch("icon.backgroundColor");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const watchedAssetId = watch("icon.assetId");
  const { objectUrl: assetImageUrl } = useAssetImage(
    applicationId,
    typeof watchedAssetId === "string" && watchedAssetId.length > 0
      ? watchedAssetId
      : undefined,
  );

  // 首字母预览自动取自应用名称，无需重新输入。
  const letter =
    typeof name === "string" && name.trim().length > 0
      ? name.trim().slice(0, 1)
      : "A";

  return (
    <Controller
      control={control}
      name="icon.mode"
      render={({ field, fieldState }) => (
        <div>
          <Radio.Group
            {...field}
            onChange={(event) => {
              field.onChange(event);
              void trigger(["icon.mode", "icon.assetId"]);
            }}
            optionType="button"
            options={[
              { value: "upload", label: "上传图标图片" },
              { value: "auto", label: "自动生成（首字母预览）" },
            ]}
            style={{ marginBottom: 12 }}
          />
          {fieldState.error !== undefined && (
            <div style={{ color: "#ff4d4f", fontSize: 12, marginBottom: 8 }}>
              {fieldState.error.message}
            </div>
          )}
          {/* 预览 / 上传组件统一放在选择器下方，而非右侧。 */}
          <div style={{ marginTop: 4 }}>
            {mode === "auto" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    background: bg ?? "#185FA5",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  {letter}
                </div>
                <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                  预览取自应用名称首字
                </span>
              </div>
            ) : (
              <Controller
                control={control}
                name="icon.assetId"
                render={({ field: assetField }) => (
                  <Upload
                    maxCount={1}
                    listType="picture-card"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      const uid = `${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2)}`;
                      setIconUrl(URL.createObjectURL(file as File));
                      setValue("icon.assetId", uid, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      void uploadAsset(applicationId, "icon", file as File)
                        .then((asset) => {
                          setValue("icon.assetId", asset.assetId, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          void trigger(["icon.mode", "icon.assetId"]);
                        })
                        .catch((error: unknown) => {
                          setValue("icon.assetId", "", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          void trigger(["icon.mode", "icon.assetId"]);
                          message.error(
                            `图标上传失败：${
                              error instanceof Error
                                ? error.message
                                : "上传服务或存储配置异常"
                            }`,
                          );
                        });
                      return false;
                    }}
                  >
                    {assetField.value ? (
                      <img
                        src={iconUrl ?? assetImageUrl ?? ""}
                        alt="应用图标"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 8,
                        }}
                      />
                    ) : (
                      <div>
                        <UploadOutlined />
                        <div style={{ marginTop: 8 }}>上传图标</div>
                      </div>
                    )}
                  </Upload>
                )}
              />
            )}
          </div>
        </div>
      )}
    />
  );
}

interface ScreenshotFile {
  uid: string;
  assetId: string;
  url: string;
  name: string;
}

function ScreenshotField({ applicationId }: { applicationId: string }) {
  const { control, setValue, trigger } = useFormContext<FieldValues>();
  const watchedScreenshotIds = useWatch({
    control,
    name: "screenshotAssetIds",
  }) as string[] | undefined;
  const watchedScreenshotKey = Array.isArray(watchedScreenshotIds)
    ? watchedScreenshotIds.join(",")
    : "";
  // 本地保存已上传图片的预览地址，保证步骤间切换（组件常驻挂载）后缩略图不丢失。
  const filesRef = useRef<ScreenshotFile[]>([]);
  const [files, setFiles] = useState<ScreenshotFile[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );

  const syncFiles = (next: ScreenshotFile[]) => {
    filesRef.current = next;
    setFiles(next);
  };

  // 编辑模式回显：草稿中的截图资产拉取图片并生成预览。
  useEffect(() => {
    if (!applicationId || !Array.isArray(watchedScreenshotIds)) {
      return;
    }
    const existing = new Set(filesRef.current.map((file) => file.assetId));
    const missing = watchedScreenshotIds.filter(
      (assetId) =>
        typeof assetId === "string" &&
        assetId.length > 0 &&
        !existing.has(assetId),
    );
    if (missing.length === 0) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      missing.map(async (assetId) => {
        const blob = await getAssetContent(applicationId, assetId);
        return {
          assetId,
          name: "历史截图",
          uid: assetId,
          url: URL.createObjectURL(blob),
        };
      }),
    )
      .then((added) => {
        if (cancelled) return;
        syncFiles([...filesRef.current, ...added].slice(0, 6));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [applicationId, watchedScreenshotKey]);

  return (
    <Controller
      control={control}
      name="screenshotAssetIds"
      render={({ fieldState }) => {
        const commit = (next: ScreenshotFile[]) => {
          syncFiles(next);
          setValue(
            "screenshotAssetIds",
            next.map((f) => f.assetId),
            { shouldDirty: true, shouldValidate: true },
          );
          void trigger("screenshotAssetIds");
        };
        const handleUpload = (file: File) => {
          const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const url = URL.createObjectURL(file);
          const optimistic = [
            ...filesRef.current,
            { uid, assetId: uid, url, name: file.name },
          ].slice(0, 6);
          commit(optimistic);
          void uploadAsset(applicationId, "screenshot", file)
            .then((asset) => {
              commit(
                filesRef.current.map((p) =>
                  p.uid === uid ? { ...p, assetId: asset.assetId } : p,
                ),
              );
            })
            .catch((error: unknown) => {
              commit(filesRef.current.filter((p) => p.uid !== uid));
              message.error(
                `截图上传失败：${
                  error instanceof Error
                    ? error.message
                    : "上传服务或存储配置异常"
                }`,
              );
            });
        };
        const handleRemove = (uid: string) => {
          const target = filesRef.current.find((f) => f.uid === uid);
          commit(filesRef.current.filter((f) => f.uid !== uid));
          // 同步删除服务端资产（失败仅忽略，前端已移除）。
          if (target && target.assetId) {
            void deleteAsset(applicationId, target.assetId).catch(() => {});
          }
        };

        const fileList: UploadFile[] = files.map((f) => ({
          uid: f.uid,
          name: f.name,
          status: "done",
          url: f.url,
          thumbUrl: f.url,
        }));
        const showUpload = files.length < 6;

        return (
          <>
            <Upload
              multiple
              maxCount={6}
              listType="picture-card"
              fileList={fileList}
              beforeUpload={(file) => {
                handleUpload(file as File);
                return false;
              }}
              onRemove={(file) => {
                handleRemove(file.uid);
                return true;
              }}
              onPreview={(file) =>
                setPreview({ url: file.url ?? "", name: file.name })
              }
            >
              {showUpload ? (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>上传截图</div>
                </div>
              ) : null}
            </Upload>
            <Text type="secondary" style={{ display: "block" }}>
              已上传 {files.length}/6 张（点击图片可预览，右上角可删除）
            </Text>
            {fieldState.error !== undefined && (
              <Text type="danger">{fieldState.error.message}</Text>
            )}
            <Modal
              open={preview !== null}
              footer={null}
              title={preview?.name}
              onCancel={() => setPreview(null)}
            >
              {preview ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  style={{ width: "100%", borderRadius: 8 }}
                />
              ) : null}
            </Modal>
          </>
        );
      }}
    />
  );
}

/** 从 RHF 嵌套错误结构中提取第一条错误（数组级或条目级；受众 / FAQ 共用）。 */
function firstNestedError(error: unknown): { message?: string } | undefined {
  if (error === undefined || error === null) return undefined;
  const record = error as {
    message?: string;
    [key: string]: unknown;
  };
  if (typeof record.message === "string" && record.message.length > 0) {
    return record;
  }
  if (Array.isArray(error)) {
    for (const item of error) {
      const found = firstNestedError(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const key of Object.keys(record)) {
    if (key === "ref" || key === "type" || key === "types") continue;
    const found = firstNestedError(record[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * 受众步：多选生成多条 AudienceRule（与契约一致）。
 * - 「全体员工」开关：勾选生成一条 all 规则；
 * - 「指定部门」多选：每个部门生成一条 department 规则（包含子部门为全局开关）；
 * - 「指定员工」多选：每名员工生成一条 employee 规则。
 * 编辑回显：draft.audience 多条规则反解为 UI 选择（rulesToSelection）。
 */
export function AudienceField({ options }: { options: PublishingOptions }) {
  const { control, setValue, trigger } = useFormContext<FieldValues>();
  const audience = useWatch({ control, name: "audience" }) as
    | AudienceRule[]
    | undefined;
  const selection = rulesToSelection(audience);

  const commit = (next: AudienceSelection) => {
    setValue("audience", selectionToRules(next), {
      shouldDirty: true,
      shouldValidate: true,
    });
    void trigger("audience");
  };

  return (
    <Controller
      control={control}
      name="audience"
      render={({ fieldState }) => (
        <Form.Item
          label="受众"
          required
          validateStatus={fieldState.error ? "error" : ""}
          help={firstNestedError(fieldState.error)?.message}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxWidth: 480,
            }}
          >
            <div>
              <Switch
                aria-label="全体员工"
                checked={selection.includeAll}
                onChange={(checked) =>
                  commit({ ...selection, includeAll: checked })
                }
              />
              <span style={{ marginLeft: 8 }}>全体员工（全体可见）</span>
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>
                指定部门（每个部门生成一条可见规则）
              </div>
              <Select
                aria-label="指定部门"
                mode="multiple"
                placeholder="选择部门（可多选）"
                value={selection.departmentIds}
                onChange={(value: string[]) =>
                  commit({ ...selection, departmentIds: value })
                }
                options={
                  options.departments as { value: string; label: string }[]
                }
                style={{ width: 480 }}
              />
              <Checkbox
                checked={selection.includeChildren}
                onChange={(event) =>
                  commit({
                    ...selection,
                    includeChildren: event.target.checked,
                  })
                }
                style={{ marginTop: 8 }}
              >
                包含子部门（对所选部门生效）
              </Checkbox>
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>
                指定员工（每名员工生成一条可见规则）
              </div>
              <Select
                aria-label="指定员工"
                mode="multiple"
                placeholder="选择员工（可多选）"
                value={selection.employeeIds}
                onChange={(value: string[]) =>
                  commit({ ...selection, employeeIds: value })
                }
                options={
                  options.employees as { value: string; label: string }[]
                }
                style={{ width: 480 }}
              />
            </div>
          </div>
        </Form.Item>
      )}
    />
  );
}

/**
 * 常见问题（FAQ）编辑器：question / answer 两列 + 删除按钮，增删改直写
 * 表单 `faq` 数组（每条 schema 校验 question/answer 非空）。
 * 规格 §5.4 必填：schema 侧 min(1) 在校验（下一步/提交）时生效；
 * 回显时缺省显示空列表可编辑（旧草稿无 faq 键 → 空数组）。
 */
export function FaqField() {
  const { control, setValue, trigger } = useFormContext<FieldValues>();
  const faq = useWatch({ control, name: "faq" }) as
    | { question: string; answer: string }[]
    | undefined;
  const list = Array.isArray(faq) ? faq : [];

  const commit = (next: { question: string; answer: string }[]) => {
    setValue("faq", next, { shouldDirty: true, shouldValidate: true });
    void trigger("faq");
  };
  const patch = (
    index: number,
    patchValue: Partial<{ question: string; answer: string }>,
  ) =>
    commit(
      list.map((entry, i) =>
        i === index ? { ...entry, ...patchValue } : entry,
      ),
    );
  const add = () => commit([...list, { question: "", answer: "" }]);
  const remove = (index: number) => commit(list.filter((_, i) => i !== index));

  return (
    <Controller
      control={control}
      name="faq"
      render={({ fieldState }) => (
        <Form.Item
          label="常见问题（FAQ）"
          required
          validateStatus={fieldState.error ? "error" : ""}
          help={firstNestedError(fieldState.error)?.message}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: 480,
            }}
          >
            {list.map((entry, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  border: "1px solid #f0f0f0",
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    flex: 1,
                  }}
                >
                  <Input
                    aria-label={`问题 ${index + 1}`}
                    placeholder="问题"
                    value={entry.question}
                    onChange={(event) =>
                      patch(index, { question: event.target.value })
                    }
                  />
                  <Input.TextArea
                    aria-label={`回答 ${index + 1}`}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    placeholder="回答"
                    value={entry.answer}
                    onChange={(event) =>
                      patch(index, { answer: event.target.value })
                    }
                  />
                </div>
                <Button
                  aria-label={`删除问题 ${index + 1}`}
                  icon={<DeleteOutlined />}
                  size="small"
                  type="text"
                  onClick={() => remove(index)}
                />
              </div>
            ))}
            <Button
              icon={<PlusOutlined />}
              onClick={add}
              style={{ alignSelf: "flex-start" }}
              type="dashed"
            >
              添加问题
            </Button>
          </div>
        </Form.Item>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// 各步骤组件
// ---------------------------------------------------------------------------

/** 桌面端 / 移动端渠道的目标系统 / 平台多选（必填：≥1 个目标）。 */
function TargetSelectEditor({
  channel,
  item,
  commitTargets,
}: {
  channel: "desktop" | "mobile";
  item: DeliveryDraftItem | undefined;
  commitTargets: (channel: "desktop" | "mobile", targets: TargetLike[]) => void;
}) {
  const isDesktop = channel === "desktop";
  const options = isDesktop ? DESKTOP_OS_OPTIONS : MOBILE_PLATFORM_OPTIONS;
  const current = Array.isArray(item?.targets)
    ? (item.targets as TargetLike[])
    : [];
  const selected = current.flatMap((target) => {
    const value = isDesktop ? target.os : target.platform;
    return value === undefined ? [] : [value];
  });
  return (
    <Form.Item
      label={isDesktop ? "目标系统（桌面端渠道）" : "目标平台（移动端渠道）"}
      required
      help="必填：至少选择一个目标系统/平台，作为下载安装元数据"
    >
      <Select
        aria-label={isDesktop ? "目标系统" : "目标平台"}
        mode="multiple"
        placeholder={
          isDesktop ? "选择目标系统（可多选）" : "选择目标平台（可多选）"
        }
        options={options}
        value={selected}
        onChange={(values: string[]) =>
          commitTargets(
            channel,
            values.map((value) =>
              isDesktop
                ? {
                    kind: "desktop" as const,
                    os: value as "windows" | "macos",
                    arch: null,
                  }
                : {
                    kind: "mobile" as const,
                    platform: value as "android" | "ios",
                    arch: null,
                  },
            ),
          )
        }
        style={CONTROL_STYLE}
      />
    </Form.Item>
  );
}

/** 小程序渠道：平台多选 + 每平台 AppId / 二维码 / 版本说明。 */
function MiniProgramTargetEditor({
  applicationId,
  item,
  commitTargets,
}: {
  applicationId: string;
  item: DeliveryDraftItem | undefined;
  commitTargets: (channel: "mini_program", targets: TargetLike[]) => void;
}) {
  const current = Array.isArray(item?.targets)
    ? (item.targets as TargetLike[])
    : [];
  const hasTarget = (platform: string) =>
    current.some((target) => target.platform === platform);

  const patchMiniProgramTarget = (
    platform: "wechat" | "dingtalk" | "alipay",
    patch: Partial<TargetLike>,
  ) => {
    const next = current.map((target) =>
      target.platform === platform ? { ...target, ...patch } : target,
    );
    commitTargets("mini_program", next);
  };

  return (
    <Form.Item
      label="小程序平台与二维码"
      required
      help="发布时小程序渠道必须至少有一个已启用平台且二维码内容通过校验（微信 wxa:// 或 https、钉钉 dingtalk:// 或 https、支付宝 alipays:// 或 https）"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {MINI_PROGRAM_PLATFORMS.map(({ value, label }) => {
          const enabled = hasTarget(value);
          const target = current.find((item) => item.platform === value);
          return (
            <div
              key={value}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <Checkbox
                checked={enabled}
                onChange={(event) => {
                  if (event.target.checked) {
                    commitTargets("mini_program", [
                      ...current,
                      {
                        kind: "miniprogram",
                        platform: value,
                        appId: "",
                        qrCodeAssetId: "",
                        versionNote: null,
                        enabled: true,
                      },
                    ]);
                  } else {
                    commitTargets(
                      "mini_program",
                      current.filter((item) => item.platform !== value),
                    );
                  }
                }}
              >
                {label}
              </Checkbox>
              {enabled ? (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Input
                    aria-label={`${label} AppId`}
                    placeholder="AppId（留空则使用二维码内容）"
                    value={target?.appId ?? ""}
                    onChange={(event) =>
                      patchMiniProgramTarget(value, {
                        appId: event.target.value,
                      })
                    }
                    style={{ width: 220 }}
                  />
                  <Upload
                    maxCount={1}
                    showUploadList={false}
                    beforeUpload={(file) => {
                      void uploadAsset(applicationId, "qr", file as File)
                        .then((asset) => {
                          patchMiniProgramTarget(value, {
                            qrCodeAssetId: asset.assetId,
                          });
                          message.success(`${label}二维码已上传`);
                        })
                        .catch((error: unknown) => {
                          message.error(
                            `二维码上传失败：${
                              error instanceof Error
                                ? error.message
                                : "上传服务或存储配置异常"
                            }`,
                          );
                        });
                      return false;
                    }}
                  >
                    <Button icon={<UploadOutlined />} size="small">
                      {target?.qrCodeAssetId ? "重新上传二维码" : "上传二维码"}
                    </Button>
                  </Upload>
                  {target?.qrCodeAssetId ? (
                    <Text type="success" style={{ fontSize: 12 }}>
                      二维码已上传
                    </Text>
                  ) : null}
                  <Input
                    aria-label={`${label} 版本说明`}
                    placeholder="版本说明（可选）"
                    value={target?.versionNote ?? ""}
                    onChange={(event) =>
                      patchMiniProgramTarget(value, {
                        versionNote: event.target.value || null,
                      })
                    }
                    style={{ width: 220 }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Form.Item>
  );
}

/**
 * 交付配置（多选渠道的逐渠道必填字段）：
 * - web 渠道：入口地址（必填）
 * - desktop 渠道：目标 OS 多选（windows/macos，必填）
 * - mobile 渠道：目标平台多选（android/ios，必填）
 * - mini_program 渠道：平台多选（微信/钉钉/支付宝）+ 每平台二维码上传
 * 全部写入对应渠道的草稿项（不再硬编码 deliveries[0]）。
 */
function DeliveryTargetsField({ applicationId }: { applicationId: string }) {
  const { control, setValue, trigger } = useFormContext<FieldValues>();
  const deliveryChannels = useWatch({ control, name: "deliveryChannels" }) as
    | DeliveryChannel[]
    | undefined;
  const deliveries = useWatch({ control, name: "deliveries" }) as
    | DeliveryDraftItem[]
    | undefined;
  const channels = Array.isArray(deliveryChannels) ? deliveryChannels : [];
  const list = Array.isArray(deliveries) ? deliveries : [];

  const itemOf = (channel: DeliveryChannel): DeliveryDraftItem | undefined =>
    list.find((item) => item.channel === channel);

  /** 更新指定渠道草稿项（不存在时按派生函数新建，保留既有字段）。
   *  targets 以表单内宽松形状 TargetLike（编辑期字段可选）存储，提交时由
   *  deliveryDraftItemSchema 收紧校验。 */
  const patchItem = (
    channel: DeliveryChannel,
    patch: Omit<Partial<DeliveryDraftItem>, "targets"> & {
      targets?: readonly TargetLike[];
    },
  ) => {
    const next = [...list];
    const index = next.findIndex((item) => item.channel === channel);
    const base =
      index >= 0 ? next[index]! : deriveDeliveriesFromChannels([channel])[0]!;
    const merged = { ...base, ...patch } as DeliveryDraftItem;
    if (index >= 0) next[index] = merged;
    else next.push(merged);
    setValue("deliveries", next, { shouldDirty: true, shouldValidate: true });
    void trigger("deliveries");
  };

  /** 把指定渠道的交付目标写入该渠道对应草稿项。 */
  const commitTargets = (channel: DeliveryChannel, nextTargets: TargetLike[]) =>
    patchItem(channel, { targets: nextTargets });

  if (channels.length === 0) {
    return null;
  }

  return (
    <>
      {channels.includes("web") && (
        <Form.Item
          label="Web 入口地址"
          required
          help="必填：Web 渠道发布后用户从该入口使用应用"
        >
          <Input
            aria-label="Web 入口地址"
            placeholder="https://apps.internal.example.com/xxx"
            value={itemOf("web")?.entryUrl ?? ""}
            onChange={(event) =>
              patchItem("web", { entryUrl: event.target.value })
            }
            style={CONTROL_STYLE}
          />
        </Form.Item>
      )}
      {channels.includes("desktop") && (
        <TargetSelectEditor
          channel="desktop"
          item={itemOf("desktop")}
          commitTargets={commitTargets}
        />
      )}
      {channels.includes("mobile") && (
        <TargetSelectEditor
          channel="mobile"
          item={itemOf("mobile")}
          commitTargets={commitTargets}
        />
      )}
      {channels.includes("mini_program") && (
        <MiniProgramTargetEditor
          applicationId={applicationId}
          item={itemOf("mini_program")}
          commitTargets={commitTargets}
        />
      )}
    </>
  );
}

function BasicInfoStep({
  options,
  applicationId,
}: {
  options: PublishingOptions;
  applicationId: string;
}) {
  const { control, setValue, trigger } = useFormContext<FieldValues>();
  const deliveries = useWatch({ control, name: "deliveries" }) as
    | DeliveryDraftItem[]
    | undefined;

  /**
   * 交付渠道多选变更：同步 deliveries（新增渠道派生空项、保留既有渠道的
   * 已填数据、移除取消渠道）并派生 applicationType（安装包制品门禁依据）。
   */
  const handleChannelsChange = (channels: DeliveryChannel[]) => {
    const current = Array.isArray(deliveries) ? deliveries : [];
    const kept = current.filter((item) => channels.includes(item.channel));
    const added = channels.filter(
      (channel) => !current.some((item) => item.channel === channel),
    );
    const next = [
      ...kept,
      ...added.flatMap((channel) => deriveDeliveriesFromChannels([channel])),
    ];
    setValue("deliveries", next, { shouldDirty: true, shouldValidate: true });
    setValue("applicationType", deriveApplicationTypeFromChannels(channels), {
      shouldDirty: true,
      shouldValidate: true,
    });
    void trigger(["deliveries", "applicationType"]);
  };

  // 维护人选项随所选部门联动：维护人必须是归属部门的在职成员
  // （部门成员接口只需要 identity.department.read 基础权限）。
  const departmentIdValue = useWatch({
    control,
    name: "departmentId",
  }) as string | undefined;
  const departmentId =
    typeof departmentIdValue === "string" && departmentIdValue.length > 0
      ? departmentIdValue
      : undefined;
  const maintainerIds = useWatch({
    control,
    name: "maintainerEmployeeIds",
  }) as string[] | undefined;
  const membersQuery = useDepartmentMembers(departmentId);
  const maintainerOptions = (membersQuery.data ?? [])
    .filter((employee) => employee.status === "active")
    .map((employee) => ({
      value: employee.employeeId,
      label: employee.displayName,
    }));
  return (
    <Form layout="vertical">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Form.Item
            label="应用名称"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Input
              {...field}
              placeholder="如：智能考勤助手"
              maxLength={160}
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="departmentId"
        render={({ field, fieldState }) => (
          <Form.Item
            label="归属部门"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Select
              {...field}
              aria-label="归属部门"
              placeholder="选择部门"
              options={
                options.departments as { value: string; label: string }[]
              }
              onChange={(value: string) => {
                // 切换归属部门时清空已选维护人（编辑回显不触发 onChange，不受影响）。
                if (
                  value !== departmentId &&
                  Array.isArray(maintainerIds) &&
                  maintainerIds.length > 0
                ) {
                  setValue("maintainerEmployeeIds", [], {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }
                field.onChange(value);
              }}
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="maintainerEmployeeIds"
        render={({ field, fieldState }) => (
          <Form.Item
            label="维护人"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Select
              {...field}
              aria-label="维护人"
              mode="multiple"
              placeholder={
                departmentId ? "选择维护人（可多选）" : "请先选择部门"
              }
              disabled={!departmentId}
              options={maintainerOptions}
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => (
          <Form.Item
            label="分类"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Select
              {...field}
              aria-label="分类"
              mode="tags"
              maxCount={1}
              optionFilterProp="label"
              value={categoryValueToTags(field.value)}
              onChange={(value: string[]) =>
                field.onChange(categoryTagsToValue(value))
              }
              placeholder="选择或输入分类"
              options={options.categories as { value: string; label: string }[]}
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="tagIds"
        render={({ field }) => (
          <Form.Item label="标签">
            <Select
              {...field}
              aria-label="标签"
              mode="tags"
              optionFilterProp="label"
              placeholder="选择或输入标签（可多选）"
              options={options.tags as { value: string; label: string }[]}
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="deliveryChannels"
        render={({ field, fieldState }) => (
          <Form.Item
            label="交付配置"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Checkbox.Group
              {...field}
              aria-label="交付渠道"
              options={DELIVERY_CHANNEL_OPTIONS}
              onChange={(checkedValues) => {
                const next = checkedValues as DeliveryChannel[];
                field.onChange(next);
                handleChannelsChange(next);
              }}
            />
          </Form.Item>
        )}
      />
      <DeliveryTargetsField applicationId={applicationId} />
      <AudienceField options={options} />
      <Form.Item label="应用图标" required>
        <IconField applicationId={applicationId} />
      </Form.Item>
      <Form.Item label="应用截图（1–6 张）" required>
        <ScreenshotField applicationId={applicationId} />
      </Form.Item>
      <Controller
        control={control}
        name="version"
        render={({ field, fieldState }) => (
          <Form.Item
            label="版本号"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Input {...field} style={CONTROL_STYLE} />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="changelog"
        render={({ field, fieldState }) => (
          <Form.Item
            label="变更说明"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Input.TextArea
              {...field}
              rows={3}
              placeholder="本次发布的内容说明"
              style={TEXTAREA_STYLE}
            />
          </Form.Item>
        )}
      />
    </Form>
  );
}

function ContentStep() {
  const { control } = useFormContext<FieldValues>();
  return (
    <Form layout="vertical">
      <Controller
        control={control}
        name="summaryHtml"
        rules={{ required: "简介不能为空" }}
        render={({ field, fieldState }) => (
          <Form.Item
            label="简介"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <RichTextEditor
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="manualHtml"
        rules={{ required: "操作手册不能为空" }}
        render={({ field, fieldState }) => (
          <Form.Item
            label="操作手册（富文本）"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <RichTextEditor
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="examplesHtml"
        rules={{ required: "使用示例不能为空" }}
        render={({ field, fieldState }) => (
          <Form.Item
            label="使用示例（富文本）"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <RichTextEditor
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          </Form.Item>
        )}
      />
      <FaqField />
    </Form>
  );
}

function RiskStep() {
  const { control, setValue } = useFormContext<FieldValues>();
  const yesNo = (label: string, name: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item label={label} required style={{ marginBottom: 16 }}>
          <Radio.Group
            {...field}
            options={[
              { value: true, label: "是" },
              { value: false, label: "否" },
            ]}
            optionType="button"
          />
        </Form.Item>
      )}
    />
  );
  return (
    <Form layout="vertical">
      {yesNo(
        "1. 是否处理员工个人信息或企业敏感数据？",
        "risk.handlesSensitiveData",
      )}
      {yesNo(
        "2. 数据是否发送至企业外部或第三方模型供应商？",
        "risk.sendsDataExternally",
      )}
      {yesNo("3. 是否保存输入、文件及对话？", "risk.retainsConversations")}
      <Controller
        control={control}
        name="risk.retentionPeriod"
        render={({ field }) => (
          <Form.Item label="保留周期（如保存，请说明）">
            <Input
              {...field}
              value={field.value ?? ""}
              placeholder="如：不保存 / 保留 30 天"
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="risk.modelProviders"
        render={({ field, fieldState }) => (
          <Form.Item
            label="4. 使用的模型 / AI 提供方"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Select
              {...field}
              mode="multiple"
              options={AI_PROVIDER_OPTIONS}
              placeholder="选择模型 / 提供方"
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      {yesNo(
        "5. 是否影响人事、财务、法务等高风险决策？",
        "risk.affectsHighRiskDecisions",
      )}
      <Controller
        control={control}
        name="risk.inputRestrictionDisclaimer"
        render={({ field, fieldState }) => (
          <Form.Item
            label="6. 用户输入限制与免责声明"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Input.TextArea
              {...field}
              rows={3}
              placeholder={DISCLAIMER_TEMPLATE}
              style={TEXTAREA_STYLE}
            />
            <Button
              size="small"
              type="link"
              style={{ paddingLeft: 0 }}
              onClick={() =>
                setValue(
                  "risk.inputRestrictionDisclaimer",
                  DISCLAIMER_TEMPLATE,
                  {
                    shouldDirty: true,
                  },
                )
              }
            >
              填入默认模板
            </Button>
          </Form.Item>
        )}
      />
    </Form>
  );
}

function labelOf(
  options: { value: string; label: string }[],
  value: string | null,
) {
  return options.find((o) => o.value === value)?.label ?? value ?? "—";
}

/** 预览：单条交付的交付目标（OS / 平台 / 小程序 AppId 与二维码）。 */
function DeliveryTargetsPreview({
  targets,
}: {
  targets: readonly TargetLike[] | undefined;
}) {
  if (!Array.isArray(targets) || targets.length === 0) return null;
  const lines = targets.map((target) => {
    if (target.kind === "desktop") {
      return `桌面端：${DESKTOP_OS_LABELS[target.os ?? ""] ?? target.os ?? "—"}${target.arch ? `（${target.arch}）` : ""}`;
    }
    if (target.kind === "mobile") {
      return `移动端：${MOBILE_PLATFORM_LABELS[target.platform ?? ""] ?? target.platform ?? "—"}${target.arch ? `（${target.arch}）` : ""}`;
    }
    return `小程序（${MINI_PROGRAM_LABELS[target.platform ?? ""] ?? target.platform ?? "—"}）：AppId：${target.appId || "—"}；二维码：${target.qrCodeAssetId ? "已上传" : "未上传"}${target.versionNote ? `；版本说明：${target.versionNote}` : ""}`;
  });
  return (
    <>
      <div style={{ marginTop: 4 }}>交付目标：</div>
      {lines.map((line, index) => (
        <div key={index} style={{ marginTop: 2 }}>
          · {line}
        </div>
      ))}
    </>
  );
}

/** 预览步：纯展示所有字段，无输入。 */
function PreviewStep({ options }: { options: PublishingOptions }) {
  const { watch } = useFormContext<FieldValues>();
  const draft = watch();
  const audienceText =
    formatAudienceParts(draft.audience, {
      departments: Object.fromEntries(
        (options.departments as { value: string; label: string }[]).map(
          (option) => [option.value, option.label],
        ),
      ),
      employees: Object.fromEntries(
        (options.employees as { value: string; label: string }[]).map(
          (option) => [option.value, option.label],
        ),
      ),
    }).join("、") || "—";
  const risk = draft.risk ?? {};
  const deliveries = Array.isArray(draft.deliveries)
    ? (draft.deliveries as Array<{
        channel: string;
        entryUrl?: string | null;
        minClientVersion?: string | null;
        enabled?: boolean;
        targets?: TargetLike[];
      }>)
    : [];
  const faq = Array.isArray(draft.faq)
    ? (draft.faq as Array<{ question: string; answer: string }>)
    : [];

  return (
    <Descriptions column={1} bordered size="small">
      <Descriptions.Item label="应用名称">
        {draft.name || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="归属部门">
        {labelOf(
          options.departments as { value: string; label: string }[],
          draft.departmentId,
        )}
      </Descriptions.Item>
      <Descriptions.Item label="维护人">
        {(draft.maintainerEmployeeIds ?? [])
          .map((id: string) =>
            labelOf(
              options.employees as { value: string; label: string }[],
              id,
            ),
          )
          .join("、") || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="分类">
        {labelOf(
          options.categories as { value: string; label: string }[],
          draft.categoryId,
        )}
      </Descriptions.Item>
      <Descriptions.Item label="标签">
        {(draft.tagIds ?? [])
          .map((id: string) =>
            labelOf(options.tags as { value: string; label: string }[], id),
          )
          .join("、") || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="交付配置">
        {APPLICATION_TYPE_LABELS[draft.applicationType] ??
          draft.applicationType}
        {deliveries.length === 0 ? (
          <div style={{ marginTop: 4, color: "#8a94a6" }}>—</div>
        ) : (
          deliveries.map((delivery, index) => (
            <div key={index} style={{ marginTop: 6 }}>
              <div>
                {CHANNEL_LABELS[delivery.channel] ?? delivery.channel}
                {delivery.enabled === false ? "（未启用）" : ""}
              </div>
              <div style={{ color: "#8a94a6", fontSize: 12 }}>
                入口地址：{delivery.entryUrl || "—"}
                {delivery.minClientVersion
                  ? `；最低客户端版本：${delivery.minClientVersion}`
                  : ""}
              </div>
              <DeliveryTargetsPreview targets={delivery.targets} />
            </div>
          ))
        )}
      </Descriptions.Item>
      <Descriptions.Item label="受众">{audienceText}</Descriptions.Item>
      <Descriptions.Item label="应用图标">
        {draft.icon?.mode === "auto" ? "自动生成（背景色 + 首字）" : "上传图标"}
      </Descriptions.Item>
      <Descriptions.Item label="应用截图">
        {(draft.screenshotAssetIds ?? []).length} 张
      </Descriptions.Item>
      <Descriptions.Item label="版本号">
        {draft.version || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="变更说明">
        {draft.changelog || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="简介">
        <RichTextView html={draft.summaryHtml ?? ""} />
      </Descriptions.Item>
      <Descriptions.Item label="操作手册">
        <RichTextView html={draft.manualHtml ?? ""} />
      </Descriptions.Item>
      <Descriptions.Item label="使用示例">
        <RichTextView html={draft.examplesHtml ?? ""} />
      </Descriptions.Item>
      <Descriptions.Item label="常见问题（FAQ）">
        {faq.length === 0 ? (
          "—"
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxWidth: 480,
            }}
          >
            {faq.map((entry, index) => (
              <div key={index}>
                <div>
                  <strong>
                    Q{index + 1}：{entry.question || "—"}
                  </strong>
                </div>
                <div style={{ color: "#596579" }}>A：{entry.answer || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="AI 风险">
        处理敏感数据：{risk.handlesSensitiveData ? "是" : "否"}；发送至外部：
        {risk.sendsDataExternally ? "是" : "否"}；保存对话：
        {risk.retainsConversations ? "是" : "否"}；影响高风险决策：
        {risk.affectsHighRiskDecisions ? "是" : "否"}
        <br />
        模型提供方：{(risk.modelProviders ?? []).join("、") || "—"}
        <br />
        保留周期：{risk.retentionPeriod || "—"}
        {risk.providerNote ? (
          <>
            <br />
            提供方说明：{risk.providerNote}
          </>
        ) : null}
      </Descriptions.Item>
      <Descriptions.Item label="免责声明">
        {risk.inputRestrictionDisclaimer || "—"}
      </Descriptions.Item>
    </Descriptions>
  );
}

// ---------------------------------------------------------------------------
// 步骤配置装配
// ---------------------------------------------------------------------------

export function createWizardSteps(
  options: PublishingOptions,
  applicationId: string,
): WizardStepConfig[] {
  return [
    {
      key: "basic",
      title: "基本信息",
      fields: [
        "name",
        "departmentId",
        "maintainerEmployeeIds",
        "categoryId",
        "applicationType",
        "deliveryChannels",
        "audience",
        "icon.mode",
        "icon.assetId",
        "screenshotAssetIds",
        "deliveries",
        "version",
        "changelog",
      ],
      render: () => (
        <BasicInfoStep options={options} applicationId={applicationId} />
      ),
    },
    {
      key: "content",
      title: "内容",
      fields: ["summaryHtml", "manualHtml", "examplesHtml", "faq"],
      render: () => <ContentStep />,
    },
    {
      key: "risk",
      title: "AI 风险",
      fields: ["risk"],
      render: () => <RiskStep />,
    },
    {
      key: "preview",
      title: "预览",
      fields: [],
      render: () => <PreviewStep options={options} />,
    },
  ];
}
