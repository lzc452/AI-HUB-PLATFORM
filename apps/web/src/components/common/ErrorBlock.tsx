import { MessageError } from "../../shared/ui/message";

export interface ErrorBlockProps {
  description: string;
  onRetry?: () => void;
  title?: string;
}

/** 兼容旧调用方的错误提示入口，不在页面布局中占位。 */
export function ErrorBlock({
  description,
  title = "加载失败",
}: ErrorBlockProps) {
  return <MessageError cause={description} title={title} />;
}
