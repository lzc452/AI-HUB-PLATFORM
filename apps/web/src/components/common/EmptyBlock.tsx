import { Empty } from "antd";

export interface EmptyBlockProps {
  action?: React.ReactNode;
  description: string;
}

/** 空状态块：Empty + 引导文案 + 可选操作。 */
export function EmptyBlock({ action, description }: EmptyBlockProps) {
  return (
    <div className="py-8">
      <Empty description={description}>{action}</Empty>
    </div>
  );
}
