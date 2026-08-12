import {
  CheckCircleFilled,
  EditOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { Button, Divider, Typography } from "antd";

import { type SyncConfigData } from "./constants";

const { Text } = Typography;

interface SyncConfigPanelProps {
  config: SyncConfigData;
}

/** 同步配置面板：展示数据源、同步范围、调度频率等只读配置。 */
export function SyncConfigPanel({ config }: SyncConfigPanelProps) {
  const items = [
    { label: "数据源", value: config.dataSource },
    { label: "同步范围", value: config.syncScope },
    { label: "调度频率", value: config.scheduleFrequency },
    { label: "增量方式", value: config.incrementalMode },
    { label: "上次全量同步", value: config.lastFullSync },
    { label: "下次全量同步", value: config.nextFullSync },
  ];

  return (
    <section className="flex h-full flex-col rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="m-0 text-base font-medium text-[#1f1f1f]">同步配置</h3>
        <Button icon={<EditOutlined />} size="small" type="link">
          编辑配置
        </Button>
      </div>
      <div className="flex-1 space-y-3">
        {items.map(({ label, value }) => (
          <div key={label}>
            <Text type="secondary" className="block text-[13px]">
              {label}
            </Text>
            {typeof value === "object" && "name" in value ? (
              <div className="mt-1 flex items-center gap-2 text-[13px] text-[#1f1f1f]">
                <MessageOutlined className="text-[#1677ff]" />
                <span>{value.name}</span>
                {value.connected ? (
                  <span className="flex items-center gap-1 text-[#52c41a]">
                    <CheckCircleFilled />
                    已连接
                  </span>
                ) : (
                  <span className="text-[#ff4d4f]">未连接</span>
                )}
              </div>
            ) : (
              <div className="mt-1 text-[13px] text-[#1f1f1f]">
                {value as string}
              </div>
            )}
            <Divider className="!mb-0 !mt-3" />
          </div>
        ))}
      </div>
    </section>
  );
}
