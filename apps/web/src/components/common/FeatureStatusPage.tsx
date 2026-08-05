import type { HealthSnapshot } from "@ai-hub/contracts";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeploymentUnitOutlined,
} from "@ant-design/icons";
import { Alert, Typography } from "antd";

import { HealthSnapshotCard } from "./HealthSnapshotCard";

const { Paragraph, Text, Title } = Typography;

export interface FeatureStatusPageProps {
  description: string;
  details: readonly string[];
  healthSnapshot: HealthSnapshot;
  statusLabel: string;
  title: string;
}

export const shellHealthSnapshot: HealthSnapshot = {
  status: "degraded",
  checks: {
    前端壳体: "up",
    业务数据接入: "down",
    流程动作接入: "down",
  },
  timestamp: "2026-07-31T00:00:00.000Z",
};

export function FeatureStatusPage({
  description,
  details,
  healthSnapshot,
  statusLabel,
  title,
}: FeatureStatusPageProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <section aria-labelledby={`${title}-heading`} className="space-y-6">
        <div className="space-y-3">
          <Text type="secondary">{statusLabel}</Text>
          <Title id={`${title}-heading`} level={1} className="!mb-0">
            {title}
          </Title>
          <Paragraph className="!mb-0 max-w-3xl text-base">
            {description}
          </Paragraph>
        </div>
        <Alert
          className="max-w-3xl"
          description="当前界面只承载导航、布局、无障碍和设计系统基线，不包含业务写操作。"
          title="该阶段未接入真实业务能力"
          showIcon
          type="info"
        />
        <section aria-labelledby={`${title}-next-steps`} className="space-y-3">
          <Title id={`${title}-next-steps`} level={3} className="!mb-0">
            后续接入范围
          </Title>
          <ul className="m-0 space-y-3 pl-5">
            {details.map((detail) => (
              <li key={detail}>
                <Text>{detail}</Text>
              </li>
            ))}
          </ul>
        </section>
      </section>
      <aside aria-labelledby={`${title}-baseline`} className="space-y-4">
        <HealthSnapshotCard
          healthSnapshot={healthSnapshot}
          headingId={`${title}-baseline`}
        />
        <section className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5">
          <Title level={4} className="!mb-3">
            当前壳体已覆盖
          </Title>
          <ul className="m-0 space-y-3 pl-5">
            <li className="flex items-start gap-2">
              <DeploymentUnitOutlined
                aria-hidden="true"
                className="mt-1 text-[#1677ff]"
              />
              <span>响应式布局与主导航骨架</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleOutlined
                aria-hidden="true"
                className="mt-1 text-[#1677ff]"
              />
              <span>跳到主要内容、键盘焦点与可见状态表达</span>
            </li>
            <li className="flex items-start gap-2">
              <ClockCircleOutlined
                aria-hidden="true"
                className="mt-1 text-[#1677ff]"
              />
              <span>Ant Design 主题令牌、中文字体与静态路由占位</span>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
