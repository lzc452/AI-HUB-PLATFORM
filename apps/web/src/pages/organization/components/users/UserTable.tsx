import { DownOutlined } from "@ant-design/icons";
import { Avatar, Button, Dropdown, Table, Tag, Tooltip } from "antd";
import type { EmployeeSummary } from "@ai-hub/contracts";
import type { TableProps } from "antd";

import { STATUS_META, type UserTableRow } from "../constants";

interface UserTableProps {
  rows: UserTableRow[];
  onDetail: (row: UserTableRow) => void;
  onDelete: (row: UserTableRow) => void;
  onDisable: (row: UserTableRow) => void;
  onEdit: (row: UserTableRow) => void;
  onResetPassword: (row: UserTableRow) => void;
  rowSelection?: TableProps<UserTableRow>["rowSelection"];
}

/** 用户表格：列定义 + 渲染。数据源完全来自入参 rows，自身不派生、不变更。 */
export function UserTable({
  onDelete,
  onDetail,
  onDisable,
  onEdit,
  onResetPassword,
  rows,
  rowSelection,
}: UserTableProps) {
  const columns = [
    {
      dataIndex: "employeeId",
      ellipsis: true,
      title: "工号",
      width: 90,
    },
    {
      dataIndex: "displayName",
      render: (name: string) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="bg-[#1677ff] text-xs" size="small">
            {name.charAt(0)}
          </Avatar>
          <Tooltip title={name}>
            <span className="block max-w-[80px] truncate">{name}</span>
          </Tooltip>
        </div>
      ),
      title: "姓名",
      width: 120,
    },
    {
      dataIndex: "departmentName",
      ellipsis: true,
      title: "部门",
      width: 160,
    },
    {
      dataIndex: "roleNames",
      render: (roleNames?: readonly string[]) => {
        const role = (roleNames ?? []).join("、");
        return (
          <Tooltip title={role || "未分配角色"}>
            <Tag
              className="m-0 truncate"
              style={{
                maxWidth: 100,
              }}
              title={role}
            >
              {role}
            </Tag>
          </Tooltip>
        );
      },
      title: "角色",
      width: 110,
    },
    {
      dataIndex: "status",
      render: (status: EmployeeSummary["status"]) => {
        const meta = STATUS_META[status];
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
      title: "状态",
      width: 86,
    },
    {
      dataIndex: "sourceText",
      render: (text: string) => (
        <Tooltip title={text}>
          <Tag
            className="m-0 truncate"
            style={{
              maxWidth: 80,
            }}
            title={text}
          >
            {text}
          </Tag>
        </Tooltip>
      ),
      title: "来源",
      width: 86,
    },
    {
      dataIndex: "lastLogin",
      ellipsis: true,
      title: "最近登录",
      width: 146,
    },
    {
      key: "action",
      render: (_value: unknown, row: UserTableRow) => (
        <div className="flex items-center gap-3 whitespace-nowrap">
          <Button
            aria-label={`编辑 ${row.displayName}`}
            className="!px-0"
            onClick={() => onEdit(row)}
            type="link"
          >
            编辑
          </Button>
          <Button
            className="!px-0"
            onClick={() => onResetPassword(row)}
            type="link"
          >
            重置密码
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: "detail",
                  label: "查看详情",
                  onClick: () => onDetail(row),
                },
                { key: "disable", label: "停用", onClick: () => onDisable(row) },
                { key: "delete", label: "删除", onClick: () => onDelete(row) },
              ],
            }}
          >
            <Button className="!px-0" type="link">
              更多 <DownOutlined className="text-xs" />
            </Button>
          </Dropdown>
        </div>
      ),
      title: "操作",
      width: 200,
    },
  ];

  return (
    <Table<UserTableRow>
      className="org-table-compact"
      columns={columns}
      dataSource={rows}
      pagination={{
        pageSize: 10,
        pageSizeOptions: [10, 20, 50],
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      rowKey="employeeId"
      rowSelection={rowSelection ?? { type: "checkbox" }}
      scroll={{ x: "max-content" }}
      size="small"
    />
  );
}
