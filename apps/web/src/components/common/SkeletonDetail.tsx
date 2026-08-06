import { Card, Skeleton } from "antd";

/** 详情页骨架屏：标题 + 主内容 + 双栏区块。 */
export function SkeletonDetail() {
  return (
    <div className="space-y-4">
      <Skeleton active paragraph={{ rows: 1 }} title={{ width: 240 }} />
      <Card className="rounded-xl">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-xl">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
        <Card className="rounded-xl">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      </div>
    </div>
  );
}
