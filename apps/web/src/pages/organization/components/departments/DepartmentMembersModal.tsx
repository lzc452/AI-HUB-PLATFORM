import { Modal, Table, Tag } from "antd";
import type { EmployeeSummary } from "@ai-hub/contracts";

import { STATUS_META } from "../constants";

interface DepartmentMembersModalProps {
  members: EmployeeSummary[] | undefined;
  open: boolean;
  title: string;
  onClose: () => void;
}

export function DepartmentMembersModal({
  members = [],
  open,
  title,
  onClose,
}: DepartmentMembersModalProps) {
  return (
    <Modal footer={null} onCancel={onClose} open={open} title={title} width={680}>
      <Table<EmployeeSummary>
        columns={[
          { dataIndex: "employeeId", title: "工号", width: 140 },
          { dataIndex: "displayName", title: "姓名", width: 140 },
          {
            dataIndex: "status",
            render: (status: EmployeeSummary["status"]) => {
              const meta = STATUS_META[status];
              return <Tag color={meta.color}>{meta.text}</Tag>;
            },
            title: "状态",
            width: 100,
          },
        ]}
        dataSource={members}
        pagination={{ pageSize: 10 }}
        rowKey="employeeId"
        size="small"
      />
    </Modal>
  );
}
