import type { CreateDemandInput } from "@ai-hub/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  List,
  Radio,
  Select,
  Space,
  Typography,
  Upload,
} from "antd";
import {
  DeleteOutlined,
  PaperClipOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";
import { submitDemandForReview } from "../../modules/innovation/demand.client";
import {
  useCreateDemandDraft,
  useUploadDemandAttachment,
} from "../../modules/innovation/useDemand";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";

interface PendingAttachment {
  attachmentId: string;
  fileName: string;
}

const schema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "标题至少 3 个字")
      .max(200, "标题不能超过 200 个字"),
    problemStatement: z.string().trim().min(10, "问题描述至少 10 个字"),
    businessScenario: z.string().trim().min(5, "业务场景至少 5 个字"),
    impact: z.string().trim().min(5, "影响说明至少 5 个字"),
    desiredOutcome: z.string().trim().min(10, "期望结果至少 10 个字"),
    currentWorkaround: z.string().trim().min(2, "替代方案至少 2 个字"),
    dataSensitivity: z.string().trim().min(2, "数据说明至少 2 个字"),
    aiSolutionIdea: z.string().trim().optional(),
    audienceType: z.enum(["all", "department", "employee"]),
    departmentId: z.string().optional(),
    employeeId: z.string().optional(),
    includeChildren: z.boolean(),
    displayAnonymously: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.audienceType === "department" && !value.departmentId) {
      context.addIssue({
        code: "custom",
        message: "请选择可见部门",
        path: ["departmentId"],
      });
    }
    if (value.audienceType === "employee" && !value.employeeId) {
      context.addIssue({
        code: "custom",
        message: "请选择可见员工",
        path: ["employeeId"],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export interface CreateDemandDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CreateDemandDrawer({ open, onClose }: CreateDemandDrawerProps) {
  const navigate = useNavigate();
  const departments = useDepartments();
  const employees = useEmployees();
  const createDraft = useCreateDemandDraft();
  const uploadAttachment = useUploadDemandAttachment();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    watch,
  } = useForm<FormValues>({
    defaultValues: {
      audienceType: "all",
      displayAnonymously: false,
      includeChildren: false,
      title: "",
      problemStatement: "",
      businessScenario: "",
      impact: "",
      desiredOutcome: "",
      currentWorkaround: "",
      dataSensitivity: "",
      aiSolutionIdea: "",
    },
    resolver: zodResolver(schema),
  });

  const audienceType = watch("audienceType");
  const departmentOptions = useMemo(
    () =>
      (departments.data ?? []).map((item) => ({
        label: item.name,
        value: item.departmentId,
      })),
    [departments.data],
  );
  const employeeOptions = useMemo(
    () =>
      (employees.data ?? []).map((item) => ({
        label: item.displayName,
        value: item.employeeId,
      })),
    [employees.data],
  );

  const closeAndReset = () => {
    reset();
    setAttachments([]);
    onClose();
  };

  const handleFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setUploading(true);
    try {
      const uploaded: PendingAttachment[] = [];
      for (const file of fileList) {
        const attachment = await uploadAttachment.mutateAsync(file);
        uploaded.push({
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
        });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
      showSuccessMessage(`已上传 ${uploaded.length} 个附件`);
    } catch {
      // mutation hook 已展示错误提示。
    } finally {
      setUploading(false);
    }
  };

  const submit = async (values: FormValues, submitForReview: boolean) => {
    const payload: CreateDemandInput = {
      title: values.title.trim(),
      problemStatement: values.problemStatement.trim(),
      businessScenario: values.businessScenario.trim(),
      impact: values.impact.trim(),
      desiredOutcome: values.desiredOutcome.trim(),
      currentWorkaround: values.currentWorkaround.trim(),
      dataSensitivity: values.dataSensitivity.trim(),
      ...(values.aiSolutionIdea?.trim()
        ? { aiSolutionIdea: values.aiSolutionIdea.trim() }
        : {}),
      audienceType: values.audienceType,
      ...(values.audienceType === "department" && values.departmentId
        ? { departmentId: values.departmentId }
        : {}),
      ...(values.audienceType === "employee" && values.employeeId
        ? { employeeId: values.employeeId }
        : {}),
      includeChildren:
        values.audienceType === "department" ? values.includeChildren : false,
      displayAnonymously: values.displayAnonymously,
      ...(attachments.length
        ? { attachmentIds: attachments.map((item) => item.attachmentId) }
        : {}),
    };

    try {
      const created = await createDraft.mutateAsync(payload);
      if (submitForReview) {
        try {
          await submitDemandForReview(created.demandId);
          showSuccessMessage("需求已提交审核");
        } catch (error) {
          showErrorMessage(error, "草稿已保存，但提交审核失败，请在详情页重试");
        }
      }
      closeAndReset();
      navigate(`/innovation/${created.demandId}`);
    } catch {
      // mutation hook 已展示错误提示，保留抽屉内容方便继续编辑。
    }
  };

  return (
    <Drawer
      destroyOnClose={false}
      footer={
        <Space className="w-full justify-end">
          <Button onClick={closeAndReset}>取消</Button>
          <Button
            loading={isSubmitting || createDraft.isPending}
            onClick={() =>
              void handleSubmit((values) => submit(values, false))()
            }
          >
            保存草稿
          </Button>
          <Button
            loading={isSubmitting || createDraft.isPending}
            onClick={() =>
              void handleSubmit((values) => submit(values, true))()
            }
            type="primary"
          >
            提交审核
          </Button>
        </Space>
      }
      onClose={closeAndReset}
      open={open}
      placement="right"
      title="发起新需求"
      width={520}
    >
      <Typography.Paragraph type="secondary">
        把问题、期望结果和可见范围一次说明清楚，便于团队共同推进。
      </Typography.Paragraph>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => event.preventDefault()}
      >
        <Form.Item
          help={errors.title?.message ?? ""}
          label="需求标题"
          validateStatus={errors.title ? "error" : ""}
        >
          <Controller
            control={control}
            name="title"
            render={({ field }) => (
              <Input
                {...field}
                aria-label="需求标题"
                maxLength={200}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={errors.problemStatement?.message ?? ""}
          label="当前问题"
          validateStatus={errors.problemStatement ? "error" : ""}
        >
          <Controller
            control={control}
            name="problemStatement"
            render={({ field }) => (
              <Input.TextArea
                {...field}
                aria-label="当前问题"
                autoSize={{ minRows: 4, maxRows: 8 }}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={errors.businessScenario?.message ?? ""}
          label="业务场景与当前流程"
          validateStatus={errors.businessScenario ? "error" : ""}
        >
          <Controller
            control={control}
            name="businessScenario"
            render={({ field }) => (
              <Input.TextArea
                {...field}
                aria-label="业务场景与当前流程"
                autoSize={{ minRows: 3, maxRows: 7 }}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={errors.impact?.message ?? ""}
          label="影响对象、发生频率和耗时"
          validateStatus={errors.impact ? "error" : ""}
        >
          <Controller
            control={control}
            name="impact"
            render={({ field }) => (
              <Input.TextArea
                {...field}
                aria-label="影响对象、发生频率和耗时"
                autoSize={{ minRows: 3, maxRows: 7 }}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={errors.desiredOutcome?.message ?? ""}
          label="期望结果"
          validateStatus={errors.desiredOutcome ? "error" : ""}
        >
          <Controller
            control={control}
            name="desiredOutcome"
            render={({ field }) => (
              <Input.TextArea
                {...field}
                aria-label="期望结果"
                autoSize={{ minRows: 4, maxRows: 8 }}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={errors.currentWorkaround?.message ?? ""}
          label="当前替代方案"
          validateStatus={errors.currentWorkaround ? "error" : ""}
        >
          <Controller
            control={control}
            name="currentWorkaround"
            render={({ field }) => (
              <Input.TextArea
                {...field}
                aria-label="当前替代方案"
                autoSize={{ minRows: 3, maxRows: 7 }}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={errors.dataSensitivity?.message ?? ""}
          label="数据类型与敏感程度"
          validateStatus={errors.dataSensitivity ? "error" : ""}
        >
          <Controller
            control={control}
            name="dataSensitivity"
            render={({ field }) => (
              <Input.TextArea
                {...field}
                aria-label="数据类型与敏感程度"
                autoSize={{ minRows: 3, maxRows: 7 }}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          help={errors.aiSolutionIdea?.message ?? ""}
          label="AI 方案设想（可选）"
          validateStatus={errors.aiSolutionIdea ? "error" : ""}
        >
          <Controller
            control={control}
            name="aiSolutionIdea"
            render={({ field }) => (
              <Input.TextArea
                {...field}
                aria-label="AI 方案设想"
                autoSize={{ minRows: 3, maxRows: 7 }}
                showCount
              />
            )}
          />
        </Form.Item>
        <Form.Item
          label="可见范围"
          help={errors.audienceType?.message ?? ""}
          validateStatus={errors.audienceType ? "error" : ""}
        >
          <Controller
            control={control}
            name="audienceType"
            render={({ field }) => (
              <Radio.Group
                {...field}
                options={[
                  { label: "全员", value: "all" },
                  { label: "部门", value: "department" },
                  { label: "员工", value: "employee" },
                ]}
              />
            )}
          />
        </Form.Item>
        {audienceType === "department" ? (
          <>
            <Form.Item
              help={errors.departmentId?.message ?? ""}
              label="选择部门"
              validateStatus={errors.departmentId ? "error" : ""}
            >
              <Controller
                control={control}
                name="departmentId"
                render={({ field }) => (
                  <Select
                    {...field}
                    allowClear
                    aria-label="选择部门"
                    className="w-full"
                    options={departmentOptions}
                    placeholder="请选择部门"
                    showSearch
                  />
                )}
              />
            </Form.Item>
            <Controller
              control={control}
              name="includeChildren"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onChange={(event) => field.onChange(event.target.checked)}
                >
                  包含子部门
                </Checkbox>
              )}
            />
          </>
        ) : null}
        {audienceType === "employee" ? (
          <Form.Item
            help={errors.employeeId?.message ?? ""}
            label="选择员工"
            validateStatus={errors.employeeId ? "error" : ""}
          >
            <Controller
              control={control}
              name="employeeId"
              render={({ field }) => (
                <Select
                  {...field}
                  allowClear
                  aria-label="选择员工"
                  className="w-full"
                  options={employeeOptions}
                  placeholder="请选择员工"
                  showSearch
                />
              )}
            />
          </Form.Item>
        ) : null}
        <Controller
          control={control}
          name="displayAnonymously"
          render={({ field }) => (
            <Checkbox
              checked={field.value}
              onChange={(event) => field.onChange(event.target.checked)}
            >
              匿名展示发起人
            </Checkbox>
          )}
        />
        <Form.Item label="附件（可选）">
          <Upload
            beforeUpload={() => false}
            fileList={[]}
            multiple
            onChange={({ fileList }) => {
              const files = fileList
                .map((item) => item.originFileObj)
                .filter(
                  (file): file is NonNullable<typeof file> =>
                    file !== undefined,
                );
              void handleFiles(files);
            }}
            showUploadList={false}
          >
            <Button icon={<UploadOutlined />} loading={uploading}>
              选择并上传附件
            </Button>
          </Upload>
          {attachments.length > 0 ? (
            <List
              className="mt-2"
              dataSource={attachments}
              locale={{ emptyText: "暂无附件" }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      aria-label={`移除附件 ${item.fileName}`}
                      danger
                      icon={<DeleteOutlined />}
                      key="remove"
                      onClick={() =>
                        setAttachments((prev) =>
                          prev.filter(
                            (it) => it.attachmentId !== item.attachmentId,
                          ),
                        )
                      }
                      size="small"
                      type="text"
                    />,
                  ]}
                >
                  <Typography.Text className="inline-flex items-center gap-2">
                    <PaperClipOutlined />
                    {item.fileName}
                  </Typography.Text>
                </List.Item>
              )}
              size="small"
            />
          ) : null}
        </Form.Item>
      </form>
    </Drawer>
  );
}
