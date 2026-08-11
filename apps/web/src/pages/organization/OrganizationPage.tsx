import { Tabs } from "antd";
import { useMemo, useState } from "react";

import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";
import { OrganizationHeader } from "./components/OrganizationHeader";
import { OrganizationStats } from "./components/OrganizationStats";
import { RoleStats } from "./components/roles/RoleStats";
import { RoleManagementTab } from "./components/roles/RoleManagementTab";
import { useRoleRows } from "./components/roles/hooks/useRoleRows";
import { UserManagementTab } from "./components/users/UserManagementTab";

/**
 * 组织管理页容器：唯一的数据获取与统计计算位置。
 * 通过 props 向子组件单向下发数据；通过 activeTab 切换用户/部门/角色/同步状态的
 * 内容区与对应 KPI 卡，保持各页签数据独立、来源单一。
 */
export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState("users");

  const employees = useEmployees();
  const departments = useDepartments();
  const roles = useRoleRows();

  const isPendingUsers = employees.isPending || departments.isPending;
  const firstErrorUsers = employees.isError
    ? employees.error
    : departments.isError
      ? departments.error
      : null;

  const userStats = useMemo(() => {
    const total = employees.data?.length ?? 0;
    const active =
      employees.data?.filter((e) => e.status === "active").length ?? 0;
    const departmentCount = departments.data?.length ?? 0;
    return { active, departmentCount, total };
  }, [employees.data, departments.data]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <OrganizationHeader />
        {activeTab === "roles" ? (
          <RoleStats rows={roles.data ?? []} />
        ) : (
          <OrganizationStats
            active={userStats.active}
            departmentCount={userStats.departmentCount}
            total={userStats.total}
          />
        )}
      </div>

      <Tabs
        activeKey={activeTab}
        items={[
          {
            children: (
              <UserManagementTab
                departments={departments}
                employees={employees}
                firstError={firstErrorUsers}
                isPending={isPendingUsers}
              />
            ),
            key: "users",
            label: "用户管理",
          },
          {
            children: (
              <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-2 text-center text-[13px] text-[#595959]">
                部门管理内容建设中
              </div>
            ),
            key: "departments",
            label: "部门管理",
          },
          {
            children: <RoleManagementTab />,
            key: "roles",
            label: "角色管理",
          },
          {
            children: (
              <div className="rounded-xl border border-solid border-[#d9d9d9] bg-white p-2 text-center text-[13px] text-[#595959]">
                同步状态内容建设中
              </div>
            ),
            key: "sync",
            label: "同步状态",
          },
        ]}
        onChange={setActiveTab}
      />
    </div>
  );
}
