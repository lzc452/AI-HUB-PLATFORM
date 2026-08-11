import { Tabs } from "antd";
import { useMemo } from "react";

import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";
import { OrganizationHeader } from "./components/OrganizationHeader";
import { OrganizationStats } from "./components/OrganizationStats";
import { UserManagementTab } from "./components/users/UserManagementTab";

/**
 * 组织管理页容器：唯一的数据获取与统计计算位置。
 * 通过 props 向子组件单向下发（employees/departments 查询、stats），
 * 不持有任何 UI 态；筛选状态收敛在 UserManagementTab 内。
 */
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
        <OrganizationHeader />
        <OrganizationStats
          active={stats.active}
          departmentCount={stats.departmentCount}
          total={stats.total}
        />
      </div>

      <Tabs
        defaultActiveKey="users"
        items={[
          {
            children: (
              <UserManagementTab
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
