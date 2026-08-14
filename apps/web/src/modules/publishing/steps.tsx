import { Controller, useFormContext } from "react-hook-form";
import type { FieldValues } from "react-hook-form";
import {
  Button,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Typography,
  Upload,
} from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { WizardStepConfig } from "../../shared/forms/FormWizard";
import { RichTextEditor } from "../../shared/ui/RichTextEditor";
import { uploadAsset } from "./publishing.client";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// 数据源（由页面层注入，后续接入组织 / 分类 / 标签接口）
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
  const { control, watch, setValue } = useFormContext<FieldValues>();
  const mode = watch("icon.mode");
  const text = watch("icon.text");
  const bg = watch("icon.backgroundColor");

  return (
    <Controller
      control={control}
      name="icon.mode"
      render={({ field }) => (
        <>
          <Radio.Group
            {...field}
            options={[
              { value: "auto", label: "自动生成（背景色 + 名称首字）" },
              { value: "upload", label: "上传图标图片" },
            ]}
            optionType="button"
            style={{ marginBottom: 12 }}
          />
          {mode === "auto" ? (
            <Space>
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
                {(text ?? "A").slice(0, 1)}
              </div>
              <Input
                value={text ?? ""}
                placeholder="展示字符（默认取名称首字）"
                onChange={(event) =>
                  setValue("icon.text", event.target.value, { shouldDirty: true })
                }
                style={{ width: 200 }}
              />
            </Space>
          ) : (
            <Upload
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => {
                void uploadAsset(applicationId, "icon", file as File).then(
                  (asset) => setValue("icon.assetId", asset.assetId),
                );
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>上传图标</Button>
            </Upload>
          )}
        </>
      )}
    />
  );
}

function ScreenshotField({ applicationId }: { applicationId: string }) {
  const { control, setValue } = useFormContext<FieldValues>();
  return (
    <Controller
      control={control}
      name="screenshotAssetIds"
      render={({ field, fieldState }) => (
        <>
          <Upload
            multiple
            maxCount={6}
            listType="picture-card"
            fileList={[]}
            beforeUpload={(file) => {
              void uploadAsset(applicationId, "screenshot", file as File).then(
                (asset) =>
                  setValue(
                    "screenshotAssetIds",
                    [...(field.value ?? []), asset.assetId],
                    { shouldDirty: true },
                  ),
              );
              return false;
            }}
          >
            {(field.value?.length ?? 0) >= 6 ? null : (
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 8 }}>上传截图</div>
              </div>
            )}
          </Upload>
          <Text type="secondary" style={{ display: "block" }}>
            已选 {field.value?.length ?? 0}/6 张
          </Text>
          {fieldState.error !== undefined && (
            <Text type="danger">{fieldState.error.message}</Text>
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
    <>
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
            <Input {...field} placeholder="如：智能考勤助手" maxLength={160} />
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
              style={{ width: "100%" }}
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
              style={{ width: "100%" }}
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
              style={{ width: "100%" }}
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
              style={{ width: "100%" }}
            />
          </Form.Item>
        )}
      />
      <Form.Item label="应用图标" required>
        <IconField applicationId={applicationId} />
      </Form.Item>
      <Form.Item label="应用截图（1–6 张）" required>
        <ScreenshotField applicationId={applicationId} />
      </Form.Item>
    </>
  );
}

function ContentStep() {
  const { control } = useFormContext<FieldValues>();
  return (
    <>
      <Controller
        control={control}
        name="summaryHtml"
        render={({ field, fieldState }) => (
          <Form.Item
            label="简介"
            required
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <RichTextEditor value={field.value ?? ""} onChange={field.onChange} />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="manualHtml"
        render={({ field, fieldState }) => (
          <Form.Item
            label="操作手册（富文本）"
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <RichTextEditor value={field.value ?? ""} onChange={field.onChange} />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="examplesHtml"
        render={({ field, fieldState }) => (
          <Form.Item
            label="使用示例（富文本）"
            validateStatus={fieldState.error ? "error" : ""}
            help={fieldState.error?.message}
          >
            <RichTextEditor value={field.value ?? ""} onChange={field.onChange} />
          </Form.Item>
        )}
      />
    </>
  );
}

function DeliveryStep() {
  const { control } = useFormContext<FieldValues>();
  return (
    <Controller
      control={control}
      name="applicationType"
      render={({ field }) => (
        <Form.Item label="应用类型" required>
          <Radio.Group
            {...field}
            optionType="button"
            options={[
              { value: "web_app", label: "Web 应用" },
              { value: "desktop_app", label: "桌面端应用" },
              { value: "mobile_app", label: "移动端应用" },
              { value: "mini_program", label: "小程序" },
            ]}
          />
        </Form.Item>
      )}
    />
  );
}

function AudienceStep({ options }: { options: PublishingOptions }) {
  const { control } = useFormContext<FieldValues>();
  return (
    <Controller
      control={control}
      name="audience.0.audienceType"
      render={({ field, fieldState }) => (
        <Form.Item
          label="受众规则"
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
      render={({ field }) => (
        <Select
          {...field}
          mode={audienceType === "department" ? "multiple" : "multiple"}
          placeholder={audienceType === "department" ? "选择部门" : "选择员工"}
          options={opts as { value: string; label: string }[]}
          style={{ width: "100%", marginTop: 12 }}
        />
      )}
    />
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
    <>
      {yesNo("1. 是否处理员工个人信息或企业敏感数据？", "risk.handlesSensitiveData")}
      {yesNo("2. 数据是否发送至企业外部或第三方模型供应商？", "risk.sendsDataExternally")}
      {yesNo("3. 是否保存输入、文件及对话？", "risk.retainsConversations")}
      <Controller
        control={control}
        name="risk.retentionPeriod"
        render={({ field }) => (
          <Form.Item label="保留周期（如保存，请说明）">
            <Input {...field} value={field.value ?? ""} placeholder="如：不保存 / 保留 30 天" />
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
              style={{ width: "100%" }}
            />
          </Form.Item>
        )}
      />
      {yesNo("5. 是否影响人事、财务、法务等高风险决策？", "risk.affectsHighRiskDecisions")}
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
            />
            <Button
              size="small"
              type="link"
              style={{ paddingLeft: 0 }}
              onClick={() =>
                setValue("risk.inputRestrictionDisclaimer", DISCLAIMER_TEMPLATE, {
                  shouldDirty: true,
                })
              }
            >
              填入默认模板
            </Button>
          </Form.Item>
        )}
      />
    </>
  );
}

function ReviewSubmitStep() {
  const { control } = useFormContext<FieldValues>();
  return (
    <>
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
            <Input {...field} style={{ width: 200 }} />
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
            <Input.TextArea {...field} rows={3} placeholder="本次发布的内容说明" />
          </Form.Item>
        )}
      />
      <Text type="secondary">
        提交后将进入自动校验与人工审核；未通过完整性校验的草稿无法提交。
      </Text>
    </>
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
      title: "基本信息与素材",
      fields: [
        "name",
        "departmentId",
        "maintainerEmployeeIds",
        "categoryId",
        "tagIds",
        "icon",
        "screenshotAssetIds",
      ],
      render: () => <BasicInfoStep options={options} applicationId={applicationId} />,
    },
    {
      key: "content",
      title: "内容",
      fields: ["summaryHtml", "manualHtml", "examplesHtml"],
      render: () => <ContentStep />,
    },
    {
      key: "delivery",
      title: "交付配置",
      fields: ["applicationType", "deliveries"],
      render: () => <DeliveryStep />,
    },
    {
      key: "audience",
      title: "受众",
      fields: ["audience"],
      render: () => <AudienceStep options={options} />,
    },
    {
      key: "risk",
      title: "AI 风险",
      fields: ["risk"],
      render: () => <RiskStep />,
    },
    {
      key: "review",
      title: "预览与提交",
      fields: ["version", "changelog"],
      render: () => <ReviewSubmitStep />,
    },
  ];
}
