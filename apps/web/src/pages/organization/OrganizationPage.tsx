import { Alert, Spin, Table, Tag, Typography } from "antd";

import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";

const { Paragraph, Text, Title } = Typography;

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
  const firstError = employees.isError ? employees.error : departments.isError ? departments.error : null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="organization-heading" className="space-y-3">
        <Text type="secondary">Phase 2 / Identity and organization</Text>
        <Title id="organization-heading" level={1} className="!mb-0">
          Organization
        </Title>
        <Paragraph className="!mb-0 max-w-3xl text-base">
          员工与部门数据来自内部身份 API，当前为只读视图。
        </Paragraph>
      </section>
      {isPending ? <Spin aria-label="组织数据加载中" /> : null}
      {firstError ? (
        <Alert
          description={firstError.message}
          showIcon
          title="组织数据加载失败"
          type="error"
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {employees.data ? (
          <section
            aria-labelledby="employees-heading"
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
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
            className="rounded-md border border-solid border-[#d9d9d9] bg-white p-5"
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
