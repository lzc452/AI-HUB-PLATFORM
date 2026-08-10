import type { ApplicationVersion } from "@ai-hub/contracts";
import { ClockCircleOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Empty, Skeleton, Tag, Timeline, Typography } from "antd";

const { Text, Title } = Typography;

function scanStatusMeta(status: string) {
  switch (status) {
    case "passed":
      return { color: "green" as const, text: "校验通过" };
    case "failed":
      return { color: "red" as const, text: "校验失败" };
    default:
      return { color: "default" as const, text: "校验中" };
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export interface MarketplaceDetailHistoryProps {
  versions: readonly ApplicationVersion[] | undefined;
  isPending: boolean;
}

/** 版本历史 Tab：Timeline 展示版本号 + 更新日志 + 扫描状态 + 创建时间。 */
export function MarketplaceDetailHistory({
  versions,
  isPending,
}: MarketplaceDetailHistoryProps) {
  if (isPending) {
    return (
      <div className="space-y-3 rounded-2xl border border-[#d9d9d9] bg-white p-6 shadow-sm">
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: 120 }} />
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="rounded-2xl border border-[#d9d9d9] bg-white p-6 shadow-sm">
        <Empty description="暂无版本记录" />
      </div>
    );
  }

  return (
    <section
      aria-label="版本历史"
      className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
    >
      <Title level={2} className="!mb-4 !text-lg">
        版本历史
      </Title>
      <Timeline
        items={versions.map((v) => ({
          children: (
            <div className="space-y-1.5 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <Text strong className="!text-base">
                  v{v.version}
                </Text>
                <Tag
                  className="!mr-0"
                  color={scanStatusMeta(v.scanStatus).color}
                  icon={<SafetyCertificateOutlined />}
                >
                  {scanStatusMeta(v.scanStatus).text}
                </Tag>
              </div>
              <p className="!mb-0 text-sm leading-relaxed text-[#595959]">
                {v.changelog || "无更新说明"}
              </p>
              <Text type="secondary" className="!text-xs">
                <ClockCircleOutlined className="mr-1" />
                {formatDate(v.createdAt)}
              </Text>
            </div>
          ),
          color: v.scanStatus === "passed" ? "green" : v.scanStatus === "failed" ? "red" : "gray",
        }))}
      />
    </section>
  );
}
