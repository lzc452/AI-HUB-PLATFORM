import { RightOutlined, WarningFilled } from "@ant-design/icons";
import { Button, Tag, Typography } from "antd";

import { SYNC_ALERT_STATUS_META, type SyncAlertSummary } from "./constants";

const { Text } = Typography;

interface SyncAlertsPanelProps {
  alerts: SyncAlertSummary[];
}

/** 异常告警面板：列表展示未处理/处理中告警。 */
export function SyncAlertsPanel({ alerts }: SyncAlertsPanelProps) {
  return (
    <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-base font-medium text-[#1f1f1f]">异常告警</h3>
        <Button icon={<RightOutlined />} size="small" type="link">
          查看全部
        </Button>
      </div>
      <div className="space-y-3">
        {alerts.map((alert) => {
          const meta = SYNC_ALERT_STATUS_META[alert.status];
          return (
            <div
              key={alert.alertId}
              className="flex items-start gap-2 rounded-lg bg-[#fafafa] p-2"
            >
              <WarningFilled className="mt-0.5 text-[#fa8c16]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <Text
                    className="block truncate text-[13px] font-medium text-[#1f1f1f]"
                    title={alert.title}
                  >
                    {alert.title}
                  </Text>
                  <Tag color={meta.color} className="m-0 shrink-0 text-xs">
                    {meta.text}
                  </Tag>
                </div>
                <Text
                  className="block truncate text-xs text-[#595959]"
                  title={alert.description}
                >
                  {alert.description}
                </Text>
                <div className="mt-1 text-xs text-[#8c8c8c]">{alert.time}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
