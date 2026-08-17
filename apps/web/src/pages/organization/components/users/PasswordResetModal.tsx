import { Button, Form, Input, Modal } from "antd";
import { useEffect } from "react";

interface PasswordResetModalProps {
  employeeId: string | null;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onSubmit: (newPassword: string) => void;
}

export function PasswordResetModal({
  employeeId,
  loading,
  open,
  onClose,
  onSubmit,
}: PasswordResetModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit(values.newPassword as string);
  };

  return (
    <Modal
      confirmLoading={loading}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="ok" loading={loading} onClick={handleOk} type="primary">
          重置
        </Button>,
      ]}
      onCancel={onClose}
      open={open}
      title={`重置密码：${employeeId ?? ""}`}
      width={420}
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          label="新密码"
          name="newPassword"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 8, message: "密码至少 8 位" },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
