import {
  AccountBookFilled,
  ApartmentOutlined,
  AppstoreFilled,
  AuditOutlined,
  CodeFilled,
  CustomerServiceFilled,
  DatabaseFilled,
  DownOutlined,
  ExperimentFilled,
  FileTextOutlined,
  FireFilled,
  ProjectFilled,
  SafetyCertificateFilled,
  SafetyCertificateOutlined,
  TagsFilled,
  ToolFilled,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Table, Tag, Tooltip } from "antd";
import type { TableRowSelection } from "antd/es/table/interface";
import type { CSSProperties } from "react";

import {
  ROLE_ICON_META,
  ROLE_STATUS_META,
  ROLE_TYPE_META,
  type RoleSummary,
} from "./constants";

interface RoleTableProps {
  rows: RoleSummary[];
  onCopy: (row: RoleSummary) => void;
  onDelete: (row: RoleSummary) => void;
  onDetail: (row: RoleSummary) => void;
  onDisable: (row: RoleSummary) => void;
  onEdit: (row: RoleSummary) => void;
  onPermissionConfig: (row: RoleSummary) => void;
  rowSelection?: TableRowSelection<RoleSummary>;
}

/** 角色图标：按角色名映射到已有 antd 图标与颜色，无自定义 SVG。 */
function RoleIcon({ roleName }: { roleName: string }) {
  const meta = ROLE_ICON_META[roleName] ?? {
    color: "#1677ff",
    iconName: "UserOutlined",
  };

  const iconClass = "text-base";
  const style: CSSProperties = { color: meta.color };

  let icon: React.ReactNode;
  switch (meta.iconName) {
    case "AccountBookFilled":
      icon = <AccountBookFilled className={iconClass} style={style} />;
      break;
    case "ApartmentOutlined":
      icon = <ApartmentOutlined className={iconClass} style={style} />;
      break;
    case "AppstoreFilled":
      icon = <AppstoreFilled className={iconClass} style={style} />;
      break;
    case "AuditOutlined":
      icon = <AuditOutlined className={iconClass} style={style} />;
      break;
    case "CodeFilled":
      icon = <CodeFilled className={iconClass} style={style} />;
      break;
    case "CustomerServiceFilled":
      icon = <CustomerServiceFilled className={iconClass} style={style} />;
      break;
    case "DatabaseFilled":
      icon = <DatabaseFilled className={iconClass} style={style} />;
      break;
    case "ExperimentFilled":
      icon = <ExperimentFilled className={iconClass} style={style} />;
      break;
    case "FileTextOutlined":
      icon = <FileTextOutlined className={iconClass} style={style} />;
      break;
    case "FireFilled":
      icon = <FireFilled className={iconClass} style={style} />;
      break;
    case "ProjectFilled":
      icon = <ProjectFilled className={iconClass} style={style} />;
      break;
    case "SafetyCertificateFilled":
      icon = <SafetyCertificateFilled className={iconClass} style={style} />;
      break;
    case "SafetyCertificateOutlined":
      icon = <SafetyCertificateOutlined className={iconClass} style={style} />;
      break;
    case "TagsFilled":
      icon = <TagsFilled className={iconClass} style={style} />;
      break;
    case "ToolFilled":
      icon = <ToolFilled className={iconClass} style={style} />;
      break;
    case "UserOutlined":
    default:
      icon = <UserOutlined className={iconClass} style={style} />;
  }

  return <span aria-hidden>{icon}</span>;
}

/** 角色表格：列定义 + 渲染。数据源完全来自入参 rows，自身不派生、不变更。 */
export function RoleTable({
  rows,
  onCopy,
  onDelete,
  onDetail,
  onDisable,
  onEdit,
  onPermissionConfig,
  rowSelection,
}: RoleTableProps) {
  const columns = [
    {
      dataIndex: "roleName",
      render: (name: string) => (
        <div className="flex min-w-0 items-center gap-2">
          <RoleIcon roleName={name} />
          <Tooltip title={name}>
            <span className="block max-w-[120px] truncate">{name}</span>
          </Tooltip>
        </div>
      ),
      title: "角色名称",
      width: 150,
    },
    {
      dataIndex: "roleType",
      render: (type: RoleSummary["roleType"]) => {
        const meta = ROLE_TYPE_META[type];
        return (
          <Tag
            className="m-0 truncate"
            color={meta.color}
            style={{ maxWidth: 90 }}
            title={meta.text}
          >
            {meta.text}
          </Tag>
        );
      },
      title: "类型",
      width: 100,
    },
    {
      dataIndex: "scope",
      ellipsis: true,
      title: "权限范围",
      width: 120,
    },
    {
      dataIndex: "memberCount",
      title: "成员数量",
      width: 90,
    },
    {
      dataIndex: "creator",
      ellipsis: true,
      title: "创建人",
      width: 100,
    },
    {
      dataIndex: "status",
      render: (status: RoleSummary["status"]) => {
        const meta = ROLE_STATUS_META[status];
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
      title: "状态",
      width: 80,
    },
    {
      dataIndex: "updatedAt",
      ellipsis: true,
      title: "最近更新",
      width: 150,
    },
    {
      key: "action",
      render: (_value: unknown, row: RoleSummary) => (
        <div className="flex items-center gap-3 whitespace-nowrap">
          <Button className="!px-0" onClick={() => onEdit(row)} type="link">
            编辑
          </Button>
          <Button
            className="!px-0"
            onClick={() => onPermissionConfig(row)}
            type="link"
          >
            权限配置
          </Button>
          <Button className="!px-0" onClick={() => onCopy(row)} type="link">
            复制
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: "detail",
                  label: "查看详情",
                  onClick: () => onDetail(row),
                },
                {
                  key: "disable",
                  label: "停用",
                  onClick: () => onDisable(row),
                },
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
      width: 240,
    },
  ];

  return (
    <Table<RoleSummary>
      className="org-table-compact"
      columns={columns}
      dataSource={rows}
      pagination={{
        pageSize: 10,
        pageSizeOptions: [10, 20, 50],
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      locale={{
        emptyText: (
          <div className="py-8 text-[13px] text-[#595959]">
            暂无匹配角色，请调整筛选条件
          </div>
        ),
      }}
      rowKey="roleId"
      rowSelection={rowSelection ?? { type: "checkbox" }}
      scroll={{ x: "max-content" }}
      size="small"
    />
  );
}
