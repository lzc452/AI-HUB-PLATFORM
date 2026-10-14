import { Button, Form, Input, InputNumber, Modal, Typography } from "antd";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type {
  CreateApiKeyInput,
  UpdateApiKeyInput,
} from "../../../modules/model-service";

/** 与后端 DTO 约束一致：名称 1–64；可选限额/有效期（空 = 平台默认/不修改）。 */
const schema = z.object({
  dailyTokenLimit: z.number().int().min(1).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1, "名称不能为空")
    .max(64, "名称不能超过 64 个字符"),
  rpmLimit: z.number().int().min(1).nullable().optional(),
  tpmLimit: z.number().int().min(1).nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  dailyTokenLimit: null,
  expiresInDays: null,
  name: "",
  rpmLimit: null,
  tpmLimit: null,
};

const LIMIT_FIELDS = [
  { label: "RPM（每分钟请求数）", max: 1_000_000, name: "rpmLimit" as const },
  {
    label: "TPM（每分钟 Token 数）",
    max: 100_000_000,
    name: "tpmLimit" as const,
  },
  {
    label: "每日 Token 配额",
    max: 1_000_000_000,
    name: "dailyTokenLimit" as const,
  },
];

export interface ApiKeyFormModalProps {
  /** 编辑模式的当前值；创建模式传 undefined。 */
  initialValues?: FormValues | undefined;
  mode: "create" | "edit";
  onClose: () => void;
  onCreate?: (input: CreateApiKeyInput) => Promise<unknown>;
  onUpdate?: (input: UpdateApiKeyInput) => Promise<unknown>;
  open: boolean;
  pending: boolean;
}

/**
 * Key 创建 / 属性编辑共用弹窗（PRD 8.1 创建与 R1-01 变更属性）。
 *
 * 两种模式共用同一套 zod 约束（与后端 DTO 逐字段对齐），差别在空值语义：
 * - 创建：空值不提交（= 平台默认）；
 * - 编辑：显式 null = 回到平台默认 / 取消有效期，省略 = 保持原值——
 *   因此编辑提交时把空值统一转为 null（后端按 null 处理），不做字段过滤。
 */
export function ApiKeyFormModal({
  initialValues,
  mode,
  onClose,
  onCreate,
  onUpdate,
  open,
  pending,
}: ApiKeyFormModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEdit = mode === "edit";
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
  } = useForm<FormValues>({
    defaultValues: initialValues ?? DEFAULT_VALUES,
    resolver: zodResolver(schema),
    // initialValues 变化时同步表单（编辑模式每次打开用最新值；创建模式为常量，不会触发 reset）
    values: initialValues ?? DEFAULT_VALUES,
  });

  const closeAndReset = () => {
    reset(initialValues ?? DEFAULT_VALUES);
    setSubmitError(null);
    onClose();
  };

  const submit = async (values: FormValues) => {
    try {
      if (isEdit) {
        const input: UpdateApiKeyInput = {
          name: values.name.trim(),
          expiresInDays: values.expiresInDays ?? null,
          rpmLimit: values.rpmLimit ?? null,
          tpmLimit: values.tpmLimit ?? null,
          dailyTokenLimit: values.dailyTokenLimit ?? null,
        };
        await onUpdate?.(input);
      } else {
        const input: CreateApiKeyInput = { name: values.name.trim() };
        if (values.expiresInDays != null)
          input.expiresInDays = values.expiresInDays;
        if (values.rpmLimit != null) input.rpmLimit = values.rpmLimit;
        if (values.tpmLimit != null) input.tpmLimit = values.tpmLimit;
        if (values.dailyTokenLimit != null) {
          input.dailyTokenLimit = values.dailyTokenLimit;
        }
        await onCreate?.(input);
      }
      closeAndReset();
    } catch (error) {
      // mutation hook 已提示；这里记录原因供弹窗内展示
      setSubmitError(error instanceof Error ? error.message : "操作失败");
    }
  };

  const limits = useMemo(() => LIMIT_FIELDS, []);

  return (
    <Modal
      confirmLoading={isSubmitting || pending}
      destroyOnClose
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={closeAndReset}>取消</Button>
          <Button
            loading={isSubmitting || pending}
            onClick={() => void handleSubmit(submit)()}
            type="primary"
          >
            {isEdit ? "保存" : "创建"}
          </Button>
        </div>
      }
      onCancel={closeAndReset}
      open={open}
      title={isEdit ? "编辑 Key 属性" : "创建 API Key"}
    >
      <Typography.Paragraph type="secondary">
        {isEdit
          ? "限额与有效期留空表示回到平台默认；有效期按保存时刻起算。"
          : "Key 用于服务端或本地脚本调用本地大模型网关（OpenAI 兼容）。禁止在浏览器端使用（Key 会暴露在前端）。创建成功后明文仅展示一次，请妥善保存。"}
      </Typography.Paragraph>
      {submitError === null ? null : (
        <Typography.Paragraph style={{ color: "#ff4d4f" }} type="danger">
          {submitError}
        </Typography.Paragraph>
      )}
      <Form component={false} layout="vertical">
        <Form.Item
          help={errors.name?.message ?? ""}
          label="Key 名称"
          required
          validateStatus={errors.name ? "error" : ""}
        >
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <Input
                {...field}
                aria-label="Key 名称"
                maxLength={64}
                placeholder="如 notebook-dev"
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={
            errors.expiresInDays?.message ??
            (isEdit
              ? "留空表示取消有效期（长期有效）"
              : "留空表示长期有效（1–365 天）")
          }
          label="有效期（天）"
          validateStatus={errors.expiresInDays ? "error" : ""}
        >
          <Controller
            control={control}
            name="expiresInDays"
            render={({ field }) => (
              <InputNumber
                aria-label="有效期（天）"
                className="w-full"
                max={365}
                min={1}
                onChange={(value) => field.onChange(value ?? null)}
                placeholder="长期有效"
                precision={0}
                value={field.value ?? null}
              />
            )}
          />
        </Form.Item>
        {limits.map((limit) => (
          <Form.Item
            help={isEdit ? "留空表示回到平台默认" : "留空表示使用平台默认值"}
            key={limit.name}
            label={limit.label}
          >
            <Controller
              control={control}
              name={limit.name}
              render={({ field }) => (
                <InputNumber
                  aria-label={limit.label}
                  className="w-full"
                  max={limit.max}
                  min={1}
                  onChange={(value) => field.onChange(value ?? null)}
                  placeholder="平台默认"
                  precision={0}
                  style={{ width: "100%" }}
                  value={field.value ?? null}
                />
              )}
            />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
