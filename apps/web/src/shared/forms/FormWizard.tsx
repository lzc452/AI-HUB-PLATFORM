import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, Space, Steps } from "antd";
import { FormProvider, useForm } from "react-hook-form";
import type { FieldValues, Resolver, UseFormReturn } from "react-hook-form";

import { showErrorMessage } from "../ui/message";

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
  /** 是否禁用最终提交（如应用已进入审核等不可提交状态）。 */
  submitDisabled?: boolean;
  /** 表单校验器（如 zodResolver），用于「下一步」与「提交」时按 schema 校验。 */
  resolver?: Resolver<FieldValues>;
}

export function FormWizard({
  steps,
  defaultValues,
  onSaveDraft,
  onSubmit,
  saveState = "idle",
  submitLabel = "提交审核",
  submitDisabled = false,
  resolver,
}: FormWizardProps) {
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FieldValues>({
    defaultValues,
    mode: "onChange",
    ...(resolver ? { resolver } : {}),
  });

  // 编辑模式异步加载草稿后回显：defaultValues 变化时重置整个表单。
  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues]);

  const isFirst = current === 0;
  const isLast = current === steps.length - 1;

  /**
   * 校验指定步骤的全部字段（与 schema 同源）。
   * 存草稿、下一步、最终提交三者共用，保证校验逻辑一致、单点维护。
   */
  const validateStep = async (index: number): Promise<boolean> => {
    const ok = await form.trigger(steps[index]!.fields);
    return ok;
  };

  const handleNext = async () => {
    if (await validateStep(current)) {
      setCurrent((index) => Math.min(index + 1, steps.length - 1));
    }
  };

  const handlePrev = () => setCurrent((index) => Math.max(index - 1, 0));

  const handleSaveDraft = async () => {
    // 存草稿与「下一步」采用一致的当前步校验；校验不通过则不保存（错误已在表单展示）。
    if (!(await validateStep(current))) return;
    await onSaveDraft(form.getValues());
  };

  const handleSubmit = async () => {
    // 按顺序校验每个步骤：任一不通过则跳转到该步并中止提交。
    for (let index = 0; index < steps.length; index += 1) {
      const ok = await validateStep(index);
      if (!ok) {
        setCurrent(index);
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit(form.getValues());
    } catch (error) {
      // 提交失败必须用户可见：恢复按钮状态并通过全局消息提示。
      // 调用方若已自行捕获并展示详情（如业务错误码映射），此处不会重复触发。
      showErrorMessage(error, "提交失败");
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
      {/* 所有步骤常驻挂载：保证上传预览等本地状态在步骤切换时不丢失。 */}
      <div style={{ maxWidth: 680, margin: "0 auto", minHeight: 360 }}>
        {steps.map((step, index) => (
          <div
            key={step.key}
            style={{ display: index === current ? "block" : "none" }}
          >
            {step.render(form)}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 24,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Space>
          <Button onClick={handleSaveDraft} loading={saveState === "saving"}>
            {saveState === "saved" ? "已保存" : "存草稿"}
          </Button>
          {!isFirst && <Button onClick={handlePrev}>上一步</Button>}
          {!isLast && (
            <Button type="primary" onClick={handleNext}>
              下一步
            </Button>
          )}
          {isLast && (
            <Button
              type="primary"
              loading={submitting}
              disabled={submitDisabled}
              onClick={handleSubmit}
            >
              {submitLabel}
            </Button>
          )}
        </Space>
      </div>
    </FormProvider>
  );
}
