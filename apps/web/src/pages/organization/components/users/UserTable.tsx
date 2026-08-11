import { DownOutlined } from "@ant-design/icons";
import { Avatar, Button, Dropdown, Table, Tag } from "antd";
import type { EmployeeSummary } from "@ai-hub/contracts";

import { STATUS_META, type UserTableRow } from "../constants";

interface UserTableProps {
  rows: UserTableRow[];
}

/** 用户表格：列定义 + 渲染。数据源完全来自入参 rows，自身不派生、不变更。 */
export function UserTable({ rows }: UserTableProps) {
  const columns = [
    {
      dataIndex: "employeeId",
      title: "工号",
      width: 90,
    },
    {
      dataIndex: "displayName",
      render: (name: string) => (
        <div className="flex items-center gap-2">
          <Avatar className="bg-[#1677ff] text-xs" size="small">
            {name.charAt(0)}
          </Avatar>
          <span>{name}</span>
        </div>
      ),
      title: "姓名",
      width: 120,
    },
    {
      dataIndex: "departmentName",
      title: "部门",
      width: 160,
    },
    {
      dataIndex: "role",
      title: "角色",
      width: 120,
    },
    {
      dataIndex: "status",
      render: (status: EmployeeSummary["status"]) => {
        const meta = STATUS_META[status];
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
      title: "状态",
      width: 90,
    },
    {
      dataIndex: "sourceText",
      render: (text: string, record: UserTableRow) => (
        <Tag color={record.sourceColor}>{text}</Tag>
      ),
      title: "来源",
      width: 90,
    },
    {
      dataIndex: "lastLogin",
      title: "最近登录",
      width: 150,
    },
    {
      key: "action",
      render: () => (
        <div className="flex items-center gap-3">
          <Button className="px-0" type="link">
            编辑
          </Button>
          <Button className="px-0" type="link">
            重置密码
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: "detail", label: "查看详情" },
                { key: "disable", label: "停用" },
                { key: "delete", label: "删除" },
              ],
            }}
          >
            <Button className="px-0" type="link">
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
      columns={columns}
      dataSource={rows}
      pagination={{
        pageSize: 10,
        pageSizeOptions: [10, 20, 50],
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      rowKey="employeeId"
      rowSelection={{ type: "checkbox" }}
      scroll={{ x: "max-content" }}
      size="middle"
    />
  );
}
