import { useMemo, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Modal, Spin, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";

import type { DepartmentSummary, EmployeeSummary } from "@ai-hub/contracts";

import {
  useArchiveEmployee,
  useApplyEmployeeImport,
  useBulkDisableEmployees,
  useCreateEmployee,
  useResetEmployeePassword,
  useUpdateEmployee,
} from "../../../../modules/auth/useIdentity";
import {
  previewEmployeeImport,
  type EmployeeImportPreviewRow,
} from "../../../../modules/auth/auth.client";
import { MessageError } from "../../../../shared/ui/message";
import {
  STATUS_META,
  createDefaultFilters,
  type UserTableRow,
  type UserFilterValue,
} from "../constants";
import { useRoleRows } from "../roles/hooks/useRoleRows";
import { CsvImportModal } from "../shared/CsvImportModal";
import { ASSIGNABLE_ROLE_CODES } from "../../../../modules/auth/roles";
import { useUserTableRows } from "./hooks/useUserTableRows";
import { PasswordResetModal } from "./PasswordResetModal";
import { UserFilterBar } from "./UserFilterBar";
import { UserFormModal } from "./UserFormModal";
import { UserTable } from "./UserTable";

interface UserManagementTabProps {
  departments: UseQueryResult<DepartmentSummary[], Error>;
  employees: UseQueryResult<EmployeeSummary[], Error>;
  firstError: Error | null;
  isPending: boolean;
}

interface FormModalState {
  mode: "create" | "edit" | "view";
  row?: UserTableRow | null;
}

const IMPORT_COLUMNS: ColumnsType<EmployeeImportPreviewRow> = [
  {
    dataIndex: "employeeId",
    render: (value: string, row) => (
      <Typography.Text
        {...(row.conflicts.employeeId ? { type: "danger" as const } : {})}
      >
        {value}
      </Typography.Text>
    ),
    title: "工号",
  },
  {
    dataIndex: "displayName",
    render: (value: string, row) => (
      <Typography.Text
        {...(row.conflicts.displayName ? { type: "danger" as const } : {})}
      >
        {value}
      </Typography.Text>
    ),
    title: "姓名",
  },
  {
    dataIndex: "primaryDepartmentId",
    render: (value: string, row) => (
      <Typography.Text
        {...(row.conflicts.primaryDepartmentId
          ? { type: "danger" as const }
          : {})}
      >
        {value}
      </Typography.Text>
    ),
    title: "部门 ID",
  },
  {
    dataIndex: "roleCodes",
    render: (value: string[], row) => (
      <Typography.Text
        {...(row.conflicts.roleCodes ? { type: "danger" as const } : {})}
      >
        {value.join("、") || "—"}
      </Typography.Text>
    ),
    title: "角色",
  },
  {
    dataIndex: "status",
    render: (value: EmployeeImportPreviewRow["status"], row) => (
      <Typography.Text
        {...(row.conflicts.status ? { type: "danger" as const } : {})}
      >
        {STATUS_META[value].text}
      </Typography.Text>
    ),
    title: "状态",
  },
  {
    render: (_, row) =>
      row.conflicts && Object.keys(row.conflicts).length > 0
        ? Object.entries(row.conflicts).map(([key, diff]) => (
            <Typography.Text key={key} type="danger">
              {key}: {diff.current || "—"} → {diff.incoming}
              <br />
            </Typography.Text>
          ))
        : "无差异",
    title: "差异",
  },
];

export function UserManagementTab({
  departments,
  employees,
  firstError,
  isPending,
}: UserManagementTabProps) {
  const [filters, setFilters] = useState<UserFilterValue>(
    createDefaultFilters(),
  );
  const [formModal, setFormModal] = useState<FormModalState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [resetRow, setResetRow] = useState<UserTableRow | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  const rows = useUserTableRows(employees, departments);
  const roleRows = useRoleRows();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const archiveEmployee = useArchiveEmployee();
  const bulkDisableEmployees = useBulkDisableEmployees();
  const applyEmployeeImport = useApplyEmployeeImport();
  const resetPassword = useResetEmployeePassword();

  const departmentOptions = useMemo(
    () =>
      departments.data?.map((dept) => ({
        label: dept.name,
        value: dept.departmentId,
      })) ?? [],
    [departments.data],
  );

  /** 用户角色选项；disabled 仅用于编辑/查看时保留已分配但 V1 不可再分发的历史角色（只读，随保存原样回传）。 */
  const roleOptions = useMemo(() => {
    const assignable = (roleRows.data ?? [])
      .filter((role) => ASSIGNABLE_ROLE_CODES.includes(role.roleId))
      .map((role) => ({
        label: role.roleName,
        value: role.roleId,
      }));
    const rowRoleNames = formModal?.row?.roleNames ?? [];
    if (rowRoleNames.length === 0) {
      return assignable;
    }
    // 历史数据：已分配的非分发角色以禁用选项保留展示，避免编辑保存（后端整体替换角色集）时被移除。
    const assignableNames = new Set(assignable.map((option) => option.label));
    const codeByName = new Map(
      (roleRows.data ?? []).map((role) => [role.roleName, role.roleId]),
    );
    const legacy = [...new Set(rowRoleNames)]
      .filter((name) => !assignableNames.has(name))
      .map((name) => ({
        label: name,
        value: codeByName.get(name) ?? name,
        disabled: true,
      }));
    return [...legacy, ...assignable];
  }, [roleRows.data, formModal?.row?.roleNames]);

  const filterRoleOptions = useMemo(
    () => [...new Set(rows.flatMap((row) => row.roleNames ?? []))].sort(),
    [rows],
  );

  const statusOptions = useMemo(
    () =>
      Object.entries(STATUS_META).map(([, { color, text }]) => ({
        label: <Tag color={color}>{text}</Tag>,
        value: text,
      })),
    [],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch =
        !filters.searchText ||
        row.employeeId.includes(filters.searchText) ||
        row.displayName.includes(filters.searchText);
      const matchesDepartment =
        !filters.department || row.departmentName === filters.department;
      const matchesRole =
        !filters.role || (row.roleNames ?? []).includes(filters.role);
      const matchesStatus =
        !filters.status || STATUS_META[row.status].text === filters.status;
      const matchesSource =
        !filters.source || row.sourceText === filters.source;
      return (
        matchesSearch &&
        matchesDepartment &&
        matchesRole &&
        matchesStatus &&
        matchesSource
      );
    });
  }, [rows, filters]);

  const closeForm = () => setFormModal(null);

  const handleSubmitForm = async (values: {
    employeeId: string;
    displayName: string;
    primaryDepartmentId: string;
    roleCodes: string[];
    password?: string;
    status: "active" | "disabled" | "pending_binding";
  }) => {
    if (formModal?.mode === "create") {
      await createEmployee.mutateAsync({
        employeeId: values.employeeId,
        displayName: values.displayName,
        primaryDepartmentId: values.primaryDepartmentId,
        roleCodes: values.roleCodes,
        password: values.password ?? "",
        status: values.status,
      });
    } else if (formModal?.row !== undefined && formModal.row !== null) {
      await updateEmployee.mutateAsync({
        employeeId: formModal.row.employeeId,
        input: {
          displayName: values.displayName,
          primaryDepartmentId: values.primaryDepartmentId,
          roleCodes: values.roleCodes,
          status: values.status,
        },
      });
    }
    closeForm();
  };

  const confirmDisable = (row: UserTableRow) => {
    Modal.confirm({
      content: `确认停用用户「${row.displayName}」吗？`,
      onOk: () => bulkDisableEmployees.mutateAsync([row.employeeId]),
      title: "停用用户",
    });
  };

  const confirmDelete = (row: UserTableRow) => {
    Modal.confirm({
      content: `确认删除用户「${row.displayName}」吗？删除后将归档该用户。`,
      onOk: () => archiveEmployee.mutateAsync(row.employeeId),
      title: "删除用户",
    });
  };

  return (
    <section className="space-y-2 rounded-xl bg-white p-2">
      {isPending ? <Spin aria-label="组织数据加载中" /> : null}
      <MessageError
        active={Boolean(firstError)}
        cause={firstError}
        title="组织数据加载失败"
      />
      <UserFilterBar
        departmentOptions={departmentOptions}
        disabledCount={selectedRowKeys.length}
        onBatchDisable={() => {
          Modal.confirm({
            content: `确认停用选中的 ${selectedRowKeys.length} 名用户吗？`,
            onOk: () =>
              bulkDisableEmployees.mutateAsync(selectedRowKeys.map(String)),
            title: "批量停用",
          });
        }}
        onBatchImport={() => setImportOpen(true)}
        onCreate={() => setFormModal({ mode: "create" })}
        roleOptions={filterRoleOptions}
        statusOptions={statusOptions}
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />
      <UserTable
        onDelete={confirmDelete}
        onDetail={(row) => setFormModal({ mode: "view", row })}
        onDisable={confirmDisable}
        onEdit={(row) => setFormModal({ mode: "edit", row })}
        onResetPassword={setResetRow}
        rows={filteredRows}
        rowSelection={{
          onChange: (keys: Key[]) => setSelectedRowKeys(keys),
          selectedRowKeys,
          type: "checkbox",
        }}
      />
      <UserFormModal
        departmentOptions={departmentOptions}
        loading={createEmployee.isPending || updateEmployee.isPending}
        mode={formModal?.mode ?? "create"}
        onClose={closeForm}
        onSubmit={handleSubmitForm}
        open={formModal !== null}
        roleOptions={roleOptions}
        row={formModal?.row ?? null}
      />
      <PasswordResetModal
        employeeId={resetRow?.employeeId ?? null}
        loading={resetPassword.isPending}
        onClose={() => setResetRow(null)}
        onSubmit={(newPassword) => {
          if (resetRow !== null) {
            void resetPassword
              .mutateAsync({
                employeeId: resetRow.employeeId,
                newPassword,
              })
              .then(() => setResetRow(null));
          }
        }}
        open={resetRow !== null}
      />
      <CsvImportModal<EmployeeImportPreviewRow>
        columns={IMPORT_COLUMNS}
        onClose={() => setImportOpen(false)}
        open={importOpen}
        preview={previewEmployeeImport}
        rowKey="employeeId"
        submit={(rows) =>
          applyEmployeeImport.mutateAsync(
            rows.map((row) => ({
              employeeId: row.employeeId,
              displayName: row.displayName,
              primaryDepartmentId: row.primaryDepartmentId,
              roleCodes: row.roleCodes,
              ...(row.password === undefined || row.password === null
                ? {}
                : { password: row.password }),
              status: row.status,
            })),
          )
        }
        title="批量导入用户"
      />
    </section>
  );
}
