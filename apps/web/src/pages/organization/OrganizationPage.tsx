import { Tabs } from "antd";
import { useMemo, useState } from "react";

import { useDepartments, useEmployees } from "../../modules/auth/useIdentity";
import { OrganizationHeader } from "./components/OrganizationHeader";
import { OrganizationStats } from "./components/OrganizationStats";
import { DepartmentManagementTab } from "./components/departments/DepartmentManagementTab";
import { DepartmentStats } from "./components/departments/DepartmentStats";
import { useDepartmentRows } from "./components/departments/hooks/useDepartmentRows";
import { RoleStats } from "./components/roles/RoleStats";
import { RoleManagementTab } from "./components/roles/RoleManagementTab";
import { useRoleRows } from "./components/roles/hooks/useRoleRows";
import { SyncStats } from "./components/sync/SyncStats";
import { SyncManagementTab } from "./components/sync/SyncManagementTab";
import { useSyncRows } from "./components/sync/hooks/useSyncRows";
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
  const departmentRows = useDepartmentRows();
  const syncRows = useSyncRows();

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

  const departmentStats = useMemo(() => {
    const rows = departmentRows.data ?? [];
    const total = rows.length;
    const active = rows.filter((d) => d.status === "active").length;
    const memberTotal = rows.reduce((sum, row) => sum + row.memberCount, 0);
    const synced = rows.filter(
      (row) => row.lastSyncAt && row.lastSyncAt !== "—",
    ).length;
    return {
      active,
      memberTotal,
      syncRate: total === 0 ? "—" : `${Math.round((synced / total) * 100)}%`,
      total,
    };
  }, [departmentRows.data]);

  return (
    <div className="space-y-4 bg-white p-4 rounded-md">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        {activeTab === "roles" ? (
          <RoleStats rows={roles.data ?? []} />
        ) : activeTab === "departments" ? (
          <DepartmentStats
            active={departmentStats.active}
            memberTotal={departmentStats.memberTotal}
            syncRate={departmentStats.syncRate}
            total={departmentStats.total}
          />
        ) : activeTab === "sync" ? (
          <SyncStats stats={syncRows.data?.stats} />
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
            children: <DepartmentManagementTab />,
            key: "departments",
            label: "部门管理",
          },
          {
            children: <RoleManagementTab />,
            key: "roles",
            label: "角色管理",
          },
          {
            children: <SyncManagementTab />,
            key: "sync",
            label: "同步状态",
          },
        ]}
        onChange={setActiveTab}
      />
    </div>
  );
}
