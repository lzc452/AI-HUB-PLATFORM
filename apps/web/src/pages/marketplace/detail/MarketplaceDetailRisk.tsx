import type { RiskDescription } from "@ai-hub/contracts";
import {
  EditOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { Button, Input, Skeleton, Typography } from "antd";
import { useState } from "react";

const { Text, Title } = Typography;

export interface MarketplaceDetailRiskProps {
  risk: RiskDescription | undefined;
  isPending: boolean;
  isOwner: boolean;
  onSave: (description: string) => void;
  savePending: boolean;
}

/** 风险说明 Tab：风险描述卡片 + 所有者编辑功能。 */
export function MarketplaceDetailRisk({
  risk,
  isPending,
  isOwner,
  onSave,
  savePending,
}: MarketplaceDetailRiskProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function handleStartEdit() {
    setDraft(risk?.riskDescription ?? "");
    setEditing(true);
  }

  function handleSave() {
    if (draft.trim().length === 0) return;
    onSave(draft.trim());
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
    setDraft("");
  }

  if (isPending) {
    return (
      <div className="space-y-3 rounded-2xl border border-[#d9d9d9] bg-white p-6 shadow-sm">
        <Skeleton active paragraph={{ rows: 1 }} title={{ width: 120 }} />
        <Skeleton active paragraph={{ rows: 3 }} />
      </div>
    );
  }

  return (
    <section
      aria-label="风险说明"
      className="rounded-2xl border border-[#d9d9d9] bg-white p-4 shadow-sm md:p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <Title level={2} className="!mb-0 !text-lg">
          <ExclamationCircleOutlined className="mr-2 text-[#faad14]" />
          风险说明
        </Title>
        {isOwner && !editing && (
          <Button
            icon={<EditOutlined />}
            onClick={handleStartEdit}
            size="small"
            type="default"
          >
            编辑
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            maxLength={5000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="请输入风险说明，如安全注意事项、兼容性限制、已知问题等"
            showCount
            value={draft}
          />
          <div className="flex gap-2">
            <Button
              disabled={draft.trim().length === 0}
              icon={<SaveOutlined />}
              loading={savePending}
              onClick={handleSave}
              type="primary"
            >
              保存
            </Button>
            <Button disabled={savePending} onClick={handleCancel}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#fff1b8] bg-[#fffbe6] p-4">
          <div className="flex items-start gap-3">
            <ExclamationCircleOutlined
              className="mt-0.5 shrink-0 text-lg text-[#faad14]"
            />
            <div>
              <Text className="!text-sm leading-relaxed text-[#595959]">
                {risk?.riskDescription ?? "暂无风险说明"}
              </Text>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
