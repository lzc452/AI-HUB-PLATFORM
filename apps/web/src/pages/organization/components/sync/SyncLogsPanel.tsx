import {
  CheckCircleFilled,
  CloseCircleFilled,
  RightOutlined,
} from "@ant-design/icons";
import { Button, Typography } from "antd";

import { type SyncLogSummary } from "./constants";

const { Text } = Typography;

interface SyncLogsPanelProps {
  logs: SyncLogSummary[];
}

/** 最近同步日志面板：时间轴式列表。 */
export function SyncLogsPanel({ logs }: SyncLogsPanelProps) {
  return (
    <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-base font-medium text-[#1f1f1f]">
          最近同步日志
        </h3>
        <Button icon={<RightOutlined />} size="small" type="link">
          查看全部
        </Button>
      </div>
      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.logId}
            className="flex items-center justify-between gap-2 text-[13px]"
          >
            <div className="flex min-w-0 items-center gap-2">
              {log.success ? (
                <CheckCircleFilled className="shrink-0 text-[#52c41a]" />
              ) : (
                <CloseCircleFilled className="shrink-0 text-[#ff4d4f]" />
              )}
              <Text className="truncate text-[#1f1f1f]" title={log.message}>
                {log.message}
              </Text>
            </div>
            <div className="shrink-0 text-xs text-[#8c8c8c]">{log.time}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
