import { Button, Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";

import type { UserTableRow } from "../constants";

interface UserFormModalProps {
  departmentOptions: { label: string; value: string }[];
  loading: boolean;
  mode: "create" | "edit" | "view";
  open: boolean;
  roleOptions: { label: string; value: string; disabled?: boolean }[];
  row?: UserTableRow | null;
  onClose: () => void;
  onSubmit: (values: {
    employeeId: string;
    displayName: string;
    primaryDepartmentId: string;
    roleCodes: string[];
    password?: string;
    status: "active" | "disabled" | "pending_binding";
  }) => void;
}

const STATUS_OPTIONS = [
  { label: "启用", value: "active" },
  { label: "停用", value: "disabled" },
  { label: "待绑定", value: "pending_binding" },
];

/** 用户新建/编辑/查看详情共用一个表单弹窗。 */
export function UserFormModal({
  departmentOptions,
  loading,
  mode,
  open,
  roleOptions,
  row,
  onClose,
  onSubmit,
}: UserFormModalProps) {
  const [form] = Form.useForm();
  const isView = mode === "view";
  const isCreate = mode === "create";

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      form.resetFields();
      form.setFieldsValue({ status: "active", roleCodes: ["employee"] });
      return;
    }
    if (row === undefined || row === null) return;
    form.setFieldsValue({
      employeeId: row.employeeId,
      displayName: row.displayName,
      primaryDepartmentId: row.primaryDepartmentId,
      roleCodes: roleOptions
        .filter((role) => row.roleNames?.includes(role.label))
        .map((role) => role.value),
      status: row.status,
    });
  }, [form, mode, open, roleOptions, row]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values);
  };

  return (
    <Modal
      className={isView ? "readonly-form" : ""}
      confirmLoading={loading}
      footer={
        isView
          ? null
          : [
              <Button key="cancel" onClick={onClose}>
                取消
              </Button>,
              <Button
                key="ok"
                loading={loading}
                onClick={handleOk}
                type="primary"
              >
                提交
              </Button>,
            ]
      }
      onCancel={onClose}
      open={open}
      title={isCreate ? "新建用户" : isView ? "用户详情" : "编辑用户"}
      width={560}
    >
      <Form
        disabled={isView}
        form={form}
        labelCol={{ span: 5 }}
        preserve={false}
        wrapperCol={{ span: 18 }}
      >
        <Form.Item
          label="工号"
          name="employeeId"
          rules={[
            { required: true, message: "请输入工号" },
            {
              pattern: /^[A-Za-z0-9_-]+$/,
              message: "仅支持字母、数字、下划线和连字符",
            },
          ]}
        >
          <Input disabled={!isCreate} />
        </Form.Item>
        <Form.Item
          label="姓名"
          name="displayName"
          rules={[{ required: true, message: "请输入姓名" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="部门"
          name="primaryDepartmentId"
          rules={[{ required: true, message: "请选择部门" }]}
        >
          <Select options={departmentOptions} placeholder="请选择部门" />
        </Form.Item>
        <Form.Item
          label="角色"
          name="roleCodes"
          rules={[{ required: true, message: "请选择至少一个角色" }]}
        >
          <Select
            mode="multiple"
            options={roleOptions}
            placeholder="请选择角色"
          />
        </Form.Item>
        <Form.Item
          dependencies={["status"]}
          label="初始密码"
          name="password"
          rules={
            isCreate
              ? [
                  { required: true, message: "请输入初始密码" },
                  { min: 8, message: "密码至少 8 位" },
                ]
              : [{ min: 8, message: "密码至少 8 位" }]
          }
        >
          <Input.Password
            autoComplete="new-password"
            placeholder={isCreate ? "请输入初始密码" : "留空表示不修改"}
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
