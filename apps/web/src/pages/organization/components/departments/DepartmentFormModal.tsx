import { Button, Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";

import type { DepartmentRow } from "./constants";

interface DepartmentFormModalProps {
  departmentOptions: { label: string; value: string }[];
  employeeOptions: { label: string; value: string }[];
  loading: boolean;
  mode: "create" | "edit";
  open: boolean;
  row?: DepartmentRow | null;
  onClose: () => void;
  onSubmit: (values: {
    departmentId?: string;
    name: string;
    parentDepartmentId?: string | null;
    managerEmployeeId?: string | null;
    status: "active" | "disabled";
  }) => void;
}

const STATUS_OPTIONS = [
  { label: "启用", value: "active" },
  { label: "停用", value: "disabled" },
];

export function DepartmentFormModal({
  departmentOptions,
  employeeOptions,
  loading,
  mode,
  open,
  row,
  onClose,
  onSubmit,
}: DepartmentFormModalProps) {
  const [form] = Form.useForm();
  const isCreate = mode === "create";

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      form.resetFields();
      form.setFieldsValue({ status: "active" });
      return;
    }
    if (row === undefined || row === null) return;
    form.setFieldsValue({
      departmentId: row.departmentId,
      name: row.name,
      parentDepartmentId: row.parentDepartmentId ?? undefined,
      managerEmployeeId: row.leader === "—" ? undefined : row.leader,
      status: row.status,
    });
  }, [form, isCreate, open, row]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values);
  };

  return (
    <Modal
      confirmLoading={loading}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" loading={loading} onClick={handleOk} type="primary">
          提交
        </Button>,
      ]}
      onCancel={onClose}
      open={open}
      title={isCreate ? "新建部门" : "编辑部门"}
      width={520}
    >
      <Form form={form} labelCol={{ span: 6 }} preserve={false} wrapperCol={{ span: 17 }}>
        {!isCreate ? (
          <Form.Item label="部门 ID" name="departmentId">
            <Input disabled />
          </Form.Item>
        ) : null}
        <Form.Item
          label="部门名称"
          name="name"
          rules={[{ required: true, message: "请输入部门名称" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="上级部门" name="parentDepartmentId">
          <Select
            allowClear
            options={departmentOptions.filter(
              (option) => option.value !== row?.departmentId,
            )}
            placeholder="请选择上级部门"
          />
        </Form.Item>
        <Form.Item label="负责人" name="managerEmployeeId">
          <Select
            allowClear
            options={employeeOptions}
            placeholder="请选择负责人"
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          label="状态"
          name="status"
          rules={[{ required: true, message: "请选择状态" }]}
        >
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
