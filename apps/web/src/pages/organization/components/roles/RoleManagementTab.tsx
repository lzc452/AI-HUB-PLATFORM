import { useMemo, useState } from "react";
import type { Key } from "react";
import { Modal, Table } from "antd";
import type { DataNode } from "antd/es/tree";
import { permissionLabel } from "@ai-hub/contracts";

import {
  useBulkDisableRoles,
  useCreateRole,
  useCopyRole,
  useDeleteRole,
  useDisableRole,
  usePermissionCatalog,
  useRoleDetail,
  useRoleTemplates,
  useUpdateRole,
} from "../../../../modules/auth/useIdentity";
import {
  createDefaultRoleFilters,
  type RoleFilterValue,
  type RoleSummary,
} from "./constants";
import { RoleFilterBar } from "./RoleFilterBar";
import { RoleFormModal } from "./RoleFormModal";
import { RoleTable } from "./RoleTable";
import { useRoleRows } from "./hooks/useRoleRows";

interface RoleFormState {
  mode: "create" | "edit" | "view" | "copy";
  row?: RoleSummary | null;
}

export function RoleManagementTab() {
  const { data: roles, error, isPending } = useRoleRows();
  const permissionCatalog = usePermissionCatalog();
  const roleTemplates = useRoleTemplates();
  const [filters, setFilters] = useState<RoleFilterValue>(
    createDefaultRoleFilters(),
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [formState, setFormState] = useState<RoleFormState | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);

  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const disableRole = useDisableRole();
  const deleteRole = useDeleteRole();
  const bulkDisableRoles = useBulkDisableRoles();
  const copyRole = useCopyRole();
  const activeRoleId =
    formState?.row !== undefined && formState?.row !== null
      ? formState.row.roleId
      : undefined;
  const roleDetail = useRoleDetail(activeRoleId);

  const filteredRows = useMemo(() => {
    if (!roles) return [];
    return roles.filter((row) => {
      const matchesSearch =
        !filters.searchText ||
        row.roleName.toLowerCase().includes(filters.searchText.toLowerCase());
      const matchesType = !filters.type || row.roleType === filters.type;
      const matchesStatus = !filters.status || row.status === filters.status;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [roles, filters]);

  const permissionTree = useMemo<DataNode[]>(() => {
    return (permissionCatalog.data ?? []).map((group) => ({
      key: group.key,
      title: group.key,
      children: group.children.map((permission) => ({
        key: permission,
        title: permissionLabel(permission),
      })),
    }));
  }, [permissionCatalog.data]);

  if (isPending) {
    return (
      <section className="space-y-2 rounded-xl border border-solid border-[#d9d9d9] bg-white p-2 text-[13px] text-[#595959]">
        角色数据加载中…
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-2 rounded-xl bg-white p-2 text-[13px] text-[#ff4d4f]">
        角色数据加载失败：{error.message}
      </section>
    );
  }

  const initialPermissions =
    formState?.mode === "create"
      ? []
      : roleDetail.data?.permissions ?? [];

  const copyName =
    formState?.mode === "copy"
      ? `${formState.row?.roleName ?? ""} 副本`
      : "";

  const handleSubmit = async (values: {
    roleCode?: string;
    name: string;
    permissions: string[];
    status: "active" | "disabled";
  }) => {
    if (formState?.mode === "create") {
      await createRole.mutateAsync({
        ...(values.roleCode === undefined
          ? {}
          : { roleCode: values.roleCode }),
        name: values.name,
        permissions: values.permissions,
      });
    } else if (formState?.mode === "copy" && formState.row) {
      await copyRole.mutateAsync({
        roleId: formState.row.roleId,
        input: {
          roleCode: values.roleCode ?? "",
          name: values.name,
        },
      });
    } else if (formState?.row !== undefined && formState.row !== null) {
      await updateRole.mutateAsync({
        roleId: formState.row.roleId,
        input: {
          name: values.name,
          permissions: values.permissions,
          status: values.status,
        },
      });
    }
    setFormState(null);
  };

  return (
    <section className="space-y-2 rounded-xl bg-white p-2">
      <RoleFilterBar
        onBatchDisable={() => {
          Modal.confirm({
            content: `确认停用选中的 ${selectedRowKeys.length} 个角色吗？`,
            onOk: () =>
              bulkDisableRoles.mutateAsync(selectedRowKeys.map(String)),
            title: "批量停用角色",
          });
        }}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onCreate={() => setFormState({ mode: "create" })}
        onPermissionTemplate={() => setTemplateOpen(true)}
        selectedCount={selectedRowKeys.length}
        value={filters}
      />
      <RoleTable
        onCopy={(row) => setFormState({ mode: "copy", row })}
        onDelete={(row) => {
          Modal.confirm({
            content: `确认删除角色「${row.roleName}」吗？仅无成员角色可删除。`,
            onOk: () => deleteRole.mutateAsync(row.roleId),
            title: "删除角色",
          });
        }}
        onDetail={(row) => setFormState({ mode: "view", row })}
        onDisable={(row) => {
          Modal.confirm({
            content: `确认停用角色「${row.roleName}」吗？`,
            onOk: () => disableRole.mutateAsync(row.roleId),
            title: "停用角色",
          });
        }}
        onEdit={(row) => setFormState({ mode: "edit", row })}
        onPermissionConfig={(row) => setFormState({ mode: "edit", row })}
        rows={filteredRows}
        rowSelection={{
          onChange: (keys) => setSelectedRowKeys(keys),
          selectedRowKeys,
          type: "checkbox",
        }}
      />
      <RoleFormModal
        initialName={copyName}
        initialPermissions={initialPermissions}
        loading={createRole.isPending || updateRole.isPending || copyRole.isPending}
        mode={
          formState?.mode === "copy"
            ? "create"
            : formState?.mode ?? "create"
        }
        onClose={() => setFormState(null)}
        onSubmit={handleSubmit}
        open={formState !== null}
        permissionTree={permissionTree}
        row={formState?.row ?? null}
        showRoleCode={formState?.mode === "copy"}
      />
      <Modal
        footer={null}
        onCancel={() => setTemplateOpen(false)}
        open={templateOpen}
        title="权限模板"
        width={720}
      >
        <Table
          columns={[
            { dataIndex: "roleCode", title: "角色编码", width: 160 },
            { dataIndex: "name", title: "角色名称", width: 160 },
            {
              dataIndex: "permissions",
              render: (permissions: string[]) =>
                permissions.map(permissionLabel).join("、"),
              title: "权限",
            },
          ]}
          dataSource={roleTemplates.data ?? []}
          pagination={{ pageSize: 10 }}
          rowKey="roleCode"
          size="small"
        />
      </Modal>
    </section>
  );
}
