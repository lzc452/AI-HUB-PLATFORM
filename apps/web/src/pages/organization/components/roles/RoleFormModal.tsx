import { Button, Form, Input, Modal, Select, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import { useEffect, useState } from "react";
import type { Key } from "react";

import type { RoleSummary } from "./constants";

interface RoleFormModalProps {
  initialPermissions?: string[];
  initialName?: string;
  loading: boolean;
  mode: "create" | "edit" | "view";
  open: boolean;
  permissionTree: DataNode[];
  row?: RoleSummary | null;
  showRoleCode?: boolean;
  onClose: () => void;
  onSubmit: (values: {
    roleCode?: string;
    name: string;
    permissions: string[];
    status: "active" | "disabled";
  }) => void;
}

const STATUS_OPTIONS = [
  { label: "启用", value: "active" },
  { label: "停用", value: "disabled" },
];

export function RoleFormModal({
  initialPermissions = [],
  initialName,
  loading,
  mode,
  open,
  permissionTree,
  row,
  showRoleCode = false,
  onClose,
  onSubmit,
}: RoleFormModalProps) {
  const [form] = Form.useForm();
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const isView = mode === "view";
  const isCreate = mode === "create";

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      form.resetFields();
      form.setFieldsValue({
        name: initialName ?? "",
        permissions: initialPermissions,
        status: "active",
      });
      setCheckedKeys(initialPermissions);
      return;
    }
    setCheckedKeys(initialPermissions);
    form.setFieldsValue({
      roleCode: row?.roleId,
      name: row?.roleName,
      permissions: initialPermissions,
      status: row?.status ?? "active",
    });
  }, [form, initialName, initialPermissions, isCreate, open, row]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values);
  };

  const handleCheck = (keys: Key[] | { checked: Key[] }) => {
    const next = (Array.isArray(keys) ? keys : keys.checked) as string[];
    setCheckedKeys(next);
    form.setFieldValue("permissions", next);
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
              <Button key="ok" loading={loading} onClick={handleOk} type="primary">
                提交
              </Button>,
            ]
      }
      onCancel={onClose}
      open={open}
      title={isCreate ? "新建角色" : isView ? "角色详情" : "编辑角色"}
      width={680}
    >
      <Form
        disabled={isView}
        form={form}
        labelCol={{ span: 5 }}
        preserve={false}
        wrapperCol={{ span: 18 }}
      >
        {!isCreate || showRoleCode ? (
          <Form.Item
            label="角色编码"
            name="roleCode"
            rules={[
              { required: true, message: "请输入角色编码" },
              {
                pattern: /^[a-z][a-z0-9_]*$/,
                message: "仅支持小写字母、数字和下划线",
              },
            ]}
          >
            <Input disabled={!isCreate && !showRoleCode} />
          </Form.Item>
        ) : null}
        <Form.Item
          label="角色名称"
          name="name"
          rules={[{ required: true, message: "请输入角色名称" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="权限" required>
          <Tree
            checkable
            checkedKeys={checkedKeys}
            defaultExpandAll
            onCheck={handleCheck}
            selectable={false}
            treeData={permissionTree}
          />
        </Form.Item>
        <Form.Item
          hidden
          name="permissions"
          rules={[{ required: true, message: "请选择至少一个权限" }]}
        >
          <Input />
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
