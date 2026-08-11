import {
  ApartmentOutlined,
  CheckCircleOutlined,
  DownOutlined,
  PlusOutlined,
  RiseOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Dropdown,
  Input,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { UseQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { DepartmentSummary, EmployeeSummary } from "@ai-hub/contracts";
import { KpiCard } from "../../components/common/KpiCard";
import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";
import { MessageError } from "../../shared/ui/message";

const { Title } = Typography;

const ROLE_OPTIONS = ["管理员", "应用管理员", "开发者", "普通用户", "系统管理员"];
const SOURCE_OPTIONS = ["钉钉", "本地"];

const STATUS_META: Record<
  EmployeeSummary["status"],
  { color: string; text: string }
> = {
  active: { color: "success", text: "启用" },
  archived: { color: "default", text: "已归档" },
  disabled: { color: "error", text: "停用" },
  pending_binding: { color: "warning", text: "待绑定" },
};

interface TableRow extends EmployeeSummary {
  departmentName: string;
  lastLogin: string;
  role: string;
  sourceColor: string;
  sourceText: string;
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

interface UserManagementProps {
  departments: UseQueryResult<DepartmentSummary[], Error>;
  employees: UseQueryResult<EmployeeSummary[], Error>;
  firstError: Error | null;
  isPending: boolean;
}

function UserManagement({
  departments,
  employees,
  firstError,
  isPending,
}: UserManagementProps) {
  const [searchText, setSearchText] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>();
  const [selectedRole, setSelectedRole] = useState<string>();
  const [selectedStatus, setSelectedStatus] = useState<string>();
  const [selectedSource, setSelectedSource] = useState<string>();

  const departmentMap = useMemo(() => {
    const map = new Map<string, string>();
    departments.data?.forEach((dept) => map.set(dept.departmentId, dept.name));
    return map;
  }, [departments.data]);

  const departmentOptions = useMemo(
    () =>
      departments.data?.map((dept) => ({ label: dept.name, value: dept.name })) ??
      [],
    [departments.data],
  );

  const tableRows: TableRow[] = useMemo(() => {
    if (!employees.data) return [];
    return employees.data.map((employee, index) => {
      const department = departments.data?.find(
        (dept) => dept.departmentId === employee.primaryDepartmentId,
      );
      const departmentName =
        departmentMap.get(employee.primaryDepartmentId) ??
        employee.primaryDepartmentId;
      const sourceText = department?.source === "dingtalk" ? "钉钉" : "本地";
      const sourceColor = department?.source === "dingtalk" ? "blue" : "orange";
      // 后端暂未返回角色与最近登录时间，使用确定性占位数据以保持视觉还原。
      const role = ROLE_OPTIONS[index % ROLE_OPTIONS.length] ?? "普通用户";
      const day = String((index % 30) + 1).padStart(2, "0");
      const hour = String(8 + (index % 14)).padStart(2, "0");
      const minute = String((index * 7) % 60).padStart(2, "0");
      const lastLogin = `2025-06-${day} ${hour}:${minute}`;

      return {
        ...employee,
        departmentName,
        lastLogin,
        role,
        sourceColor,
        sourceText,
      };
    });
  }, [employees.data, departments.data, departmentMap]);

  const filteredRows = useMemo(() => {
    return tableRows.filter((row) => {
      const matchesSearch =
        !searchText ||
        row.employeeId.includes(searchText) ||
        row.displayName.includes(searchText);
      const matchesDepartment =
        !selectedDepartment || row.departmentName === selectedDepartment;
      const matchesRole = !selectedRole || row.role === selectedRole;
      const matchesStatus =
        !selectedStatus || STATUS_META[row.status].text === selectedStatus;
      const matchesSource =
        !selectedSource || row.sourceText === selectedSource;
      return (
        matchesSearch &&
        matchesDepartment &&
        matchesRole &&
        matchesStatus &&
        matchesSource
      );
    });
  }, [
    tableRows,
    searchText,
    selectedDepartment,
    selectedRole,
    selectedStatus,
    selectedSource,
  ]);

  const statusOptions = useMemo(
    () =>
      Object.entries(STATUS_META).map(([, { color, text }]) => ({
        label: <Tag color={color}>{text}</Tag>,
        value: text,
      })),
    [],
  );

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
      render: (text: string, record: TableRow) => (
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
    <section className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-4">
      {isPending ? <Spin aria-label="组织数据加载中" /> : null}
      <MessageError
        active={Boolean(firstError)}
        cause={firstError}
        title="组织数据加载失败"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          allowClear
          className="w-[200px]"
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索工号 / 姓名"
          prefix={<SearchOutlined className="text-[#bfbfbf]" />}
          value={searchText}
        />
        <Select
          allowClear
          onChange={setSelectedDepartment}
          options={departmentOptions}
          placeholder="全部部门"
          style={{ width: 160 }}
          value={selectedDepartment}
        />
        <Select
          allowClear
          onChange={setSelectedRole}
          options={ROLE_OPTIONS.map((role) => ({ label: role, value: role }))}
          placeholder="全部角色"
          style={{ width: 160 }}
          value={selectedRole}
        />
        <Select
          allowClear
          onChange={(value) => setSelectedStatus(value)}
          options={statusOptions}
          placeholder="全部状态"
          style={{ width: 160 }}
          value={selectedStatus}
        />
        <Select
          allowClear
          onChange={setSelectedSource}
          options={SOURCE_OPTIONS.map((source) => ({
            label: source,
            value: source,
          }))}
          placeholder="全部来源"
          style={{ width: 160 }}
          value={selectedSource}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button icon={<PlusOutlined />} type="primary">
            新建用户
          </Button>
          <Button icon={<UploadOutlined />}>批量导入</Button>
          <Button danger icon={<StopOutlined />}>
            批量停用
          </Button>
        </div>
      </div>

      <Table<TableRow>
        columns={columns}
        dataSource={filteredRows}
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
    </section>
  );
}

export default function OrganizationPage() {
  const employees = useEmployees();
  const departments = useDepartments();

  const isPending = employees.isPending || departments.isPending;
  const firstError = employees.isError
    ? employees.error
    : departments.isError
      ? departments.error
      : null;

  const stats = useMemo(() => {
    const total = employees.data?.length ?? 0;
    const active =
      employees.data?.filter((e) => e.status === "active").length ?? 0;
    const departmentCount = departments.data?.length ?? 0;
    return { active, departmentCount, total };
  }, [employees.data, departments.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1677ff]">
            <TeamOutlined className="text-xl text-white" />
          </div>
          <Title className="!mb-0" level={1}>
            组织管理
          </Title>
        </div>
        <section
          aria-label="组织统计"
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
        >
          <KpiCard
            icon={<UserOutlined className="text-[#1677ff]" />}
            label="总用户"
            trend="较上月 +36"
            value={formatNumber(stats.total)}
          />
          <KpiCard
            icon={<CheckCircleOutlined className="text-[#52c41a]" />}
            label="启用中"
            trend="较上月 +28"
            value={formatNumber(stats.active)}
          />
          <KpiCard
            icon={<ApartmentOutlined className="text-[#722ed1]" />}
            label="部门数量"
            trend="较上月 +2"
            value={formatNumber(stats.departmentCount)}
          />
          <KpiCard
            icon={<RiseOutlined className="text-[#fa8c16]" />}
            label="最近同步成功率"
            trend="较上月 +2.1%"
            value="98.6%"
          />
        </section>
      </div>

      <Tabs
        defaultActiveKey="users"
        items={[
          {
            children: (
              <UserManagement
                departments={departments}
                employees={employees}
                firstError={firstError}
                isPending={isPending}
              />
            ),
            key: "users",
            label: "用户管理",
          },
          {
            children: (
              <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-8 text-center text-[#595959]">
                部门管理内容建设中
              </div>
            ),
            key: "departments",
            label: "部门管理",
          },
          {
            children: (
              <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-8 text-center text-[#595959]">
                角色管理内容建设中
              </div>
            ),
            key: "roles",
            label: "角色管理",
          },
          {
            children: (
              <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-8 text-center text-[#595959]">
                同步状态内容建设中
              </div>
            ),
            key: "sync",
            label: "同步状态",
          },
        ]}
      />
    </div>
  );
}
