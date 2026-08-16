import { Avatar, Descriptions, Modal, Tag } from "antd";

import { STATUS_META, type UserTableRow } from "../constants";

interface UserDetailModalProps {
  row: UserTableRow | null;
  onClose: () => void;
}

/** 组织用户详情 Modal：展示真实角色、部门、来源与最近登录时间。 */
export function UserDetailModal({ onClose, row }: UserDetailModalProps) {
  const statusMeta = row ? STATUS_META[row.status] : null;
  return (
    <Modal
      footer={null}
      onCancel={onClose}
      open={row !== null}
      title="用户详情"
      width={520}
    >
      {row ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="bg-[#1677ff]" size={48}>
              {row.displayName.charAt(0)}
            </Avatar>
            <div className="min-w-0">
              <div className="text-base font-medium text-[#1f1f1f]">
                {row.displayName}
              </div>
              <div className="text-sm text-[#8c8c8c]">{row.employeeId}</div>
            </div>
          </div>
          <Descriptions
            column={1}
            items={[
              {
                key: "department",
                label: "部门",
                children: row.departmentName,
              },
              {
                key: "status",
                label: "状态",
                children: statusMeta ? (
                  <Tag color={statusMeta.color}>{statusMeta.text}</Tag>
                ) : null,
              },
              {
                key: "source",
                label: "来源",
                children: <Tag color={row.sourceColor}>{row.sourceText}</Tag>,
              },
              {
                key: "roles",
                label: "角色",
                children: (
                  <span className="flex flex-wrap gap-1">
                    {(row.roleNames ?? []).length === 0
                      ? "未分配角色"
                      : row.roleNames!.map((role) => (
                          <Tag color="blue" key={role}>
                            {role}
                          </Tag>
                        ))}
                  </span>
                ),
              },
              { key: "lastLogin", label: "最近登录", children: row.lastLogin },
            ]}
            size="small"
          />
        </div>
      ) : null}
    </Modal>
  );
}
