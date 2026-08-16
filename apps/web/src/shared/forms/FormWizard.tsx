import { useState } from "react";
import type { ReactNode } from "react";
import { Button, Space, Steps } from "antd";
import { FormProvider, useForm } from "react-hook-form";
import type { FieldValues, UseFormReturn } from "react-hook-form";

/**
 * 通用分步表单容器（组件化复用核心）。
 *
 * 与具体业务字段无关：业务方只提供 steps 配置（每步的标题、字段名与渲染组件），
 * 容器负责步骤切换、当前步校验、草稿保存与最终提交。未来「创新需求」「认领方案」
 * 等向导可复用同一套分步 / 草稿 / 回显机制。
 */

export interface WizardStepConfig {
  /** 步骤唯一键。 */
  key: string;
  /** 步骤标题。 */
  title: string;
  /** 步骤说明（可选）。 */
  description?: string;
  /** 该步涉及的 RHF 字段名（用于「下一步」时触发局部校验）。 */
  fields: string[];
  /** 渲染该步表单控件的组件（通过 useFormContext 访问表单）。 */
  render: (form: UseFormReturn<FieldValues>) => ReactNode;
}

export interface FormWizardProps {
  steps: WizardStepConfig[];
  defaultValues: FieldValues;
  /** 存草稿回调（接收当前全量值）。 */
  onSaveDraft: (values: FieldValues) => void | Promise<void>;
  /** 最终提交回调（接收全量值）。 */
  onSubmit: (values: FieldValues) => void | Promise<void>;
  /** 草稿保存状态（用于按钮 loading / 提示）。 */
  saveState?: "idle" | "saving" | "saved";
  /** 提交按钮文案。 */
  submitLabel?: string;
}

export function FormWizard({
  steps,
  defaultValues,
  onSaveDraft,
  onSubmit,
  saveState = "idle",
  submitLabel = "提交审核",
}: FormWizardProps) {
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FieldValues>({ defaultValues });

  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  const handleNext = async () => {
    const valid = await form.trigger(steps[current]!.fields);
    if (valid) setCurrent((index) => Math.min(index + 1, steps.length - 1));
  };

  const handlePrev = () => setCurrent((index) => Math.max(index - 1, 0));

  const handleSaveDraft = async () => {
    await onSaveDraft(form.getValues());
  };

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) return;
    setSubmitting(true);
    try {
      await onSubmit(form.getValues());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormProvider {...form}>
      <Steps
        current={current}
        items={steps.map((step) => ({
          title: step.title,
          description: step.description,
        }))}
        onChange={(value) => {
          if (value < current) setCurrent(value);
        }}
        style={{ marginBottom: 24 }}
      />
      <div style={{ minHeight: 320 }}>{steps[current]!.render(form)}</div>
      <Space
        style={{
          marginTop: 24,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Button onClick={handleSaveDraft} loading={saveState === "saving"}>
          {saveState === "saved" ? "已保存" : "存草稿"}
        </Button>
        <Space>
          {!isFirst && <Button onClick={handlePrev}>上一步</Button>}
          {!isLast && (
            <Button type="primary" onClick={handleNext}>
              下一步
            </Button>
          )}
          {isLast && (
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              {submitLabel}
            </Button>
          )}
        </Space>
      </Space>
    </FormProvider>
  );
}
