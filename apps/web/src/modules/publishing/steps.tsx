import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { FieldValues } from "react-hook-form";
import {
  Button,
  Descriptions,
  Form,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { WizardStepConfig } from "../../shared/forms/FormWizard";
import { RichTextEditor } from "../../shared/ui/RichTextEditor";
import { RichTextView } from "../../shared/ui/RichTextView";
import { getAssetContent } from "../application/application.client";
import { useAssetImage } from "../application/useApplication";
import { deleteAsset, uploadAsset } from "./publishing.client";

const { Text } = Typography;

/** 输入控件统一宽度（单行）。 */
const CONTROL_STYLE: React.CSSProperties = { width: 240 };
/** 多行文本宽度（需求：Textarea 480px）。 */
const TEXTAREA_STYLE: React.CSSProperties = { width: 480 };

const APPLICATION_TYPE_OPTIONS = [
  { value: "web_app", label: "Web 应用" },
  { value: "desktop_app", label: "桌面端应用" },
  { value: "mobile_app", label: "移动端应用" },
  { value: "mini_program", label: "小程序" },
];

const APPLICATION_TYPE_LABELS: Record<string, string> = {
  web_app: "Web 应用",
  desktop_app: "桌面端应用",
  mobile_app: "移动端应用",
  mini_program: "小程序",
};

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
  const { control, watch, setValue, trigger } =
    useFormContext<FieldValues>();
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
                      void uploadAsset(applicationId, "icon", file as File).then(
                        (asset) => {
                          setValue("icon.assetId", asset.assetId, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          void trigger(["icon.mode", "icon.assetId"]);
                        },
                      ).catch((error: unknown) => {
                        setValue("icon.assetId", "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        void trigger(["icon.mode", "icon.assetId"]);
                        message.error(
                          `图标上传失败：${
                            error instanceof Error ? error.message : "上传服务或存储配置异常"
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
          void uploadAsset(applicationId, "screenshot", file).then((asset) => {
            commit(
              filesRef.current.map((p) =>
                p.uid === uid ? { ...p, assetId: asset.assetId } : p,
              ),
            );
          }).catch((error: unknown) => {
            commit(filesRef.current.filter((p) => p.uid !== uid));
            message.error(
              `截图上传失败：${
                error instanceof Error ? error.message : "上传服务或存储配置异常"
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

function DepartmentSelect({ options }: { options: PublishingOptions }) {
  const { control, watch } = useFormContext<FieldValues>();
  const audienceType = watch("audience.0.audienceType");
  if (audienceType !== "department" && audienceType !== "employee") return null;
  const name =
    audienceType === "department" ? "audience.0.departmentId" : "audience.0.employeeId";
  const opts = audienceType === "department" ? options.departments : options.employees;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <>
          <Select
            {...field}
            mode="multiple"
            status={fieldState.error ? "error" : ""}
            placeholder={audienceType === "department" ? "选择部门" : "选择员工"}
            options={opts as { value: string; label: string }[]}
            style={{ ...CONTROL_STYLE, marginTop: 12 }}
          />
          {fieldState.error !== undefined && (
            <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>
              {fieldState.error.message}
            </div>
          )}
        </>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// 各步骤组件
// ---------------------------------------------------------------------------

function BasicInfoStep({
  options,
  applicationId,
}: {
  options: PublishingOptions;
  applicationId: string;
}) {
  const { control } = useFormContext<FieldValues>();
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
            <Input {...field} placeholder="如：智能考勤助手" maxLength={160} style={CONTROL_STYLE} />
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
              placeholder="选择部门"
              options={options.departments as { value: string; label: string }[]}
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
              mode="multiple"
              placeholder="选择维护人（可多选）"
              options={options.employees as { value: string; label: string }[]}
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
              placeholder="选择分类"
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
              mode="multiple"
              placeholder="选择标签（可多选）"
              options={options.tags as { value: string; label: string }[]}
              style={CONTROL_STYLE}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="applicationType"
        render={({ field, fieldState }) => (
          <Form.Item
            label="交付配置"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Radio.Group {...field} optionType="button" options={APPLICATION_TYPE_OPTIONS} />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="audience.0.audienceType"
        render={({ field, fieldState }) => (
          <Form.Item
            label="受众"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <Radio.Group
              {...field}
              options={[
                { value: "all", label: "全体员工" },
                { value: "department", label: "指定部门" },
                { value: "employee", label: "指定员工" },
              ]}
            />
            <DepartmentSelect options={options} />
          </Form.Item>
        )}
      />
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
      {yesNo("1. 是否处理员工个人信息或企业敏感数据？", "risk.handlesSensitiveData")}
      {yesNo("2. 数据是否发送至企业外部或第三方模型供应商？", "risk.sendsDataExternally")}
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

function labelOf(options: { value: string; label: string }[], value: string | null) {
  return options.find((o) => o.value === value)?.label ?? value ?? "—";
}

/** 预览步：纯展示所有字段，无输入。 */
function PreviewStep({ options }: { options: PublishingOptions }) {
  const { watch } = useFormContext<FieldValues>();
  const draft = watch();
  const audience = Array.isArray(draft.audience) ? draft.audience[0] : undefined;
  const audienceText =
    audience?.audienceType === "department"
      ? "指定部门"
      : audience?.audienceType === "employee"
        ? "指定员工"
        : "全体员工";
  const risk = draft.risk ?? {};

  return (
    <Descriptions column={1} bordered size="small">
      <Descriptions.Item label="应用名称">{draft.name || "—"}</Descriptions.Item>
      <Descriptions.Item label="归属部门">
        {labelOf(options.departments as { value: string; label: string }[], draft.departmentId)}
      </Descriptions.Item>
      <Descriptions.Item label="维护人">
        {(draft.maintainerEmployeeIds ?? [])
          .map((id: string) =>
            labelOf(options.employees as { value: string; label: string }[], id),
          )
          .join("、") || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="分类">
        {labelOf(options.categories as { value: string; label: string }[], draft.categoryId)}
      </Descriptions.Item>
      <Descriptions.Item label="标签">
        {(draft.tagIds ?? [])
          .map((id: string) => labelOf(options.tags as { value: string; label: string }[], id))
          .join("、") || "—"}
      </Descriptions.Item>
      <Descriptions.Item label="交付配置">
        {APPLICATION_TYPE_LABELS[draft.applicationType] ?? draft.applicationType}
      </Descriptions.Item>
      <Descriptions.Item label="受众">{audienceText}</Descriptions.Item>
      <Descriptions.Item label="应用图标">
        {draft.icon?.mode === "auto" ? "自动生成（背景色 + 首字）" : "上传图标"}
      </Descriptions.Item>
      <Descriptions.Item label="应用截图">
        {(draft.screenshotAssetIds ?? []).length} 张
      </Descriptions.Item>
      <Descriptions.Item label="版本号">{draft.version || "—"}</Descriptions.Item>
      <Descriptions.Item label="变更说明">{draft.changelog || "—"}</Descriptions.Item>
      <Descriptions.Item label="简介">
        <RichTextView html={draft.summaryHtml ?? ""} />
      </Descriptions.Item>
      <Descriptions.Item label="操作手册">
        <RichTextView html={draft.manualHtml ?? ""} />
      </Descriptions.Item>
      <Descriptions.Item label="使用示例">
        <RichTextView html={draft.examplesHtml ?? ""} />
      </Descriptions.Item>
      <Descriptions.Item label="AI 风险">
        处理敏感数据：{risk.handlesSensitiveData ? "是" : "否"}；发送至外部：
        {risk.sendsDataExternally ? "是" : "否"}；保存对话：
        {risk.retainsConversations ? "是" : "否"}；影响高风险决策：
        {risk.affectsHighRiskDecisions ? "是" : "否"}
        <br />
        模型提供方：{(risk.modelProviders ?? []).join("、") || "—"}
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
        "audience.0.audienceType",
        "audience.0.departmentId",
        "audience.0.employeeId",
        "icon.mode",
        "icon.assetId",
        "screenshotAssetIds",
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
      fields: ["summaryHtml", "manualHtml", "examplesHtml"],
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
