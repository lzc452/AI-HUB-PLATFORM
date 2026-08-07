import { Spin, Table, Tag, Typography } from "antd";

import { ErrorBlock } from "../../components/common/ErrorBlock";
import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";

const { Title } = Typography;

const employeeStatusText: Record<string, string> = {
  active: "在职",
  archived: "已归档",
  disabled: "已禁用",
  pending_binding: "待绑定",
};

export default function OrganizationPage() {
  const employees = useEmployees();
  const departments = useDepartments();

  const isPending = employees.isPending || departments.isPending;
  const firstError = employees.isError
    ? employees.error
    : departments.isError
      ? departments.error
      : null;

  return (
    <div className="space-y-4">
      {isPending ? <Spin aria-label="组织数据加载中" /> : null}
      {firstError ? (
        <ErrorBlock
          description={firstError.message}
          onRetry={() => {
            void employees.refetch();
            void departments.refetch();
          }}
          title="组织数据加载失败"
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {employees.data ? (
          <section
            aria-labelledby="employees-heading"
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-4"
          >
            <Title id="employees-heading" level={2} className="!mb-3">
              员工
            </Title>
            <Table
              columns={[
                { dataIndex: "employeeId", title: "工号" },
                { dataIndex: "displayName", title: "姓名" },
                {
                  dataIndex: "status",
                  render: (status: string) => (
                    <Tag>{employeeStatusText[status] ?? status}</Tag>
                  ),
                  title: "状态",
                },
                { dataIndex: "primaryDepartmentId", title: "主部门" },
              ]}
              dataSource={employees.data}
              pagination={false}
              rowKey="employeeId"
              size="small"
            />
          </section>
        ) : null}
        {departments.data ? (
          <section
            aria-labelledby="departments-heading"
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-4"
          >
            <Title id="departments-heading" level={2} className="!mb-3">
              部门
            </Title>
            <Table
              columns={[
                { dataIndex: "name", title: "名称" },
                {
                  dataIndex: "parentDepartmentId",
                  render: (value: string | null) => value ?? "—",
                  title: "上级部门",
                },
                {
                  dataIndex: "source",
                  render: (source: string) => (
                    <Tag>{source === "dingtalk" ? "钉钉同步" : "本地"}</Tag>
                  ),
                  title: "来源",
                },
              ]}
              dataSource={departments.data}
              pagination={false}
              rowKey="departmentId"
              size="small"
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
