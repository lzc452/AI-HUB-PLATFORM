import { Button, Modal } from "antd";
import type { ButtonProps } from "antd";

export interface ConfirmModalProps {
  buttonProps?: ButtonProps;
  buttonText: string;
  content: React.ReactNode;
  danger?: boolean;
  okText?: string;
  onOk: () => void | Promise<void>;
  title: string;
}

/** 确认操作按钮：点击弹出 Modal.confirm，确认后执行 onOk。 */
export function ConfirmModal({
  buttonProps,
  buttonText,
  content,
  danger = false,
  okText = "确认",
  onOk,
  title,
}: ConfirmModalProps) {
  const handleClick = () => {
    Modal.confirm({
      cancelText: "取消",
      content,
      okText,
      okType: danger ? "danger" : "primary",
      onOk,
      title,
    });
  };

  return (
    <Button danger={danger} onClick={handleClick} {...buttonProps}>
      {buttonText}
    </Button>
  );
}
