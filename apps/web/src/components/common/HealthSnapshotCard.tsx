import type { HealthSnapshot } from "@ai-hub/contracts";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Descriptions, Tag, Typography } from "antd";

const { Title } = Typography;

export interface HealthSnapshotCardProps {
  healthSnapshot: HealthSnapshot;
  headingId: string;
}

function formatSnapshotTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(timestamp));
}

function getCheckTag(status: "up" | "down") {
  return status === "up" ? (
    <Tag color="success" icon={<CheckCircleOutlined aria-hidden="true" />}>
      已就绪
    </Tag>
  ) : (
    <Tag color="default" icon={<ClockCircleOutlined aria-hidden="true" />}>
      待接入
    </Tag>
  );
}

export function HealthSnapshotCard({
  healthSnapshot,
  headingId,
}: HealthSnapshotCardProps) {
  return (
    <section className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Title id={headingId} level={4} className="!mb-0">
          基线状态
        </Title>
        <Tag color={healthSnapshot.status === "ok" ? "success" : "processing"}>
          {healthSnapshot.status === "ok" ? "整体就绪" : "局部建设中"}
        </Tag>
      </div>
      <Descriptions
        column={1}
        items={Object.entries(healthSnapshot.checks).map(([label, status]) => ({
          key: label,
          label,
          children: getCheckTag(status),
        }))}
        size="small"
      />
      <div className="mt-4 flex items-center gap-2 text-sm text-[#8c8c8c]">
        <SafetyCertificateOutlined aria-hidden="true" />
        <span>
          静态快照时间：{formatSnapshotTimestamp(healthSnapshot.timestamp)}
        </span>
      </div>
    </section>
  );
}
