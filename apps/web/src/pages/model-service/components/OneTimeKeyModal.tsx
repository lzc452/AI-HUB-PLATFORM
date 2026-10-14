import { Alert, Button, Modal, Typography } from "antd";
import { useState } from "react";

import type { CreateApiKeyResult } from "../../../modules/model-service";
import {
  showSuccessMessage,
  showWarningMessage,
} from "../../../shared/ui/message";

const { Paragraph, Text } = Typography;

export interface OneTimeKeyModalProps {
  /** 创建或轮换的结果；null 时不渲染。 */
  result: CreateApiKeyResult | null;
  /** 弹窗标题场景：创建 or 轮换。 */
  scene: "create" | "rotate";
  onClose: () => void;
}

/**
 * 一次性明文展示弹窗（PRD R1-10）：
 * - 明文只存在于本组件 state，**不写 localStorage / sessionStorage**，关闭即清除；
 * - 复制走 clipboard API；不可用（非安全上下文）时降级为手动选择复制；
 * - 明确告知「仅本次展示」，杜绝「刷新后再找回来」的预期。
 */
export function OneTimeKeyModal({
  result,
  scene,
  onClose,
}: OneTimeKeyModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (result === null) return;
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard === undefined) {
      showWarningMessage("当前环境不支持自动复制，请手动选择明文复制");
      return;
    }
    try {
      await clipboard.writeText(result.apiKey);
      setCopied(true);
      showSuccessMessage("已复制到剪贴板");
    } catch {
      showWarningMessage("复制失败，请手动选择明文复制");
    }
  };

  return (
    <Modal
      cancelText="关闭"
      closable={false}
      maskClosable={false}
      okButtonProps={{ disabled: !copied }}
      okText={copied ? "我已保存" : "请先复制明文"}
      onCancel={onClose}
      onOk={onClose}
      open={result !== null}
      title={scene === "create" ? "Key 创建成功" : "Key 轮换成功"}
    >
      {result === null ? null : (
        <div className="space-y-3">
          <Alert
            description="明文仅本次展示，关闭后无法再次查看；请立即复制并妥善保存。服务端只存储摘要，丢失只能重新创建或轮换。"
            message="请立即保存 API Key"
            showIcon
            type="warning"
          />
          <div className="rounded-md border border-solid border-[#d9d9d9] bg-[#fafafa] p-3">
            <Paragraph
              className="!mb-0"
              code
              copyable={false}
              ellipsis={{ rows: 2, tooltip: result.apiKey }}
              style={{ wordBreak: "break-all" }}
            >
              {result.apiKey}
            </Paragraph>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => void handleCopy()} type="primary">
              复制明文
            </Button>
            {copied ? <Text type="success">已复制</Text> : null}
          </div>
          {scene === "rotate" ? (
            <Text style={{ fontSize: 12 }} type="secondary">
              轮换无宽限期：旧 Key 已立即撤销，请尽快切换到新 Key。
            </Text>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
