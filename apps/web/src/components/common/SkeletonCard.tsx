import { Card, Skeleton } from "antd";

export interface SkeletonCardProps {
  count?: number;
}

/** 卡片骨架屏：模拟图标 + 标题 + 多行文本。 */
export function SkeletonCard({ count = 1 }: SkeletonCardProps) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="rounded-xl">
          <div className="flex items-center gap-3">
            <Skeleton.Avatar active shape="square" size={48} />
            <Skeleton.Input active size="small" style={{ width: 160 }} />
          </div>
          <Skeleton active className="!mt-4" paragraph={{ rows: 3 }} />
        </Card>
      ))}
    </>
  );
}
