import { Alert, Button } from "antd";

export interface ErrorBlockProps {
  description: string;
  onRetry?: () => void;
  title?: string;
}

/** 错误状态块：Alert type="error" + 可选重试按钮。 */
export function ErrorBlock({
  description,
  onRetry,
  title = "加载失败",
}: ErrorBlockProps) {
  return (
    <Alert
      action={
        onRetry ? (
          <Button onClick={onRetry} size="small">
            重试
          </Button>
        ) : undefined
      }
      description={description}
      showIcon
      title={title}
      type="error"
    />
  );
}
