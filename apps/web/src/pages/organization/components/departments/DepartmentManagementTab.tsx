import { useMemo, useState } from "react";
import { Modal, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import {
  useApplyDepartmentImport,
  useCreateDepartment,
  useDeleteDepartment,
  useDepartmentMembers,
  useEmployees,
  useSyncDepartment,
  useTriggerSync,
  useUpdateDepartment,
} from "../../../../modules/auth/useIdentity";
import {
  previewDepartmentImport,
  type DepartmentImportPreviewRow,
} from "../../../../modules/auth/auth.client";
import {
  createDefaultDepartmentFilters,
  filterDepartmentRows,
  type DepartmentFilterValue,
  type DepartmentRow,
} from "./constants";
import { CsvImportModal } from "../shared/CsvImportModal";
import { DepartmentFilterBar } from "./DepartmentFilterBar";
import { DepartmentFormModal } from "./DepartmentFormModal";
import { DepartmentMembersModal } from "./DepartmentMembersModal";
import { DepartmentTable } from "./DepartmentTable";
import { useDepartmentRows } from "./hooks/useDepartmentRows";

interface DepartmentFormState {
  mode: "create" | "edit";
  row?: DepartmentRow | null;
}

const IMPORT_COLUMNS: ColumnsType<DepartmentImportPreviewRow> = [
  {
    dataIndex: "departmentId",
    render: (value: string, row) => (
      <Typography.Text
        {...(row.conflicts.departmentId
          ? { type: "danger" as const }
          : {})}
      >
        {value}
      </Typography.Text>
    ),
    title: "部门 ID",
  },
  {
    dataIndex: "name",
    render: (value: string, row) => (
      <Typography.Text
        {...(row.conflicts.name ? { type: "danger" as const } : {})}
      >
        {value}
      </Typography.Text>
    ),
    title: "部门名称",
  },
  {
    dataIndex: "parentDepartmentId",
    render: (value: string | null, row) => (
      <Typography.Text
        {...(row.conflicts.parentDepartmentId
          ? { type: "danger" as const }
          : {})}
      >
        {value ?? "—"}
      </Typography.Text>
    ),
    title: "上级部门",
  },
  {
    dataIndex: "managerEmployeeId",
    render: (value: string | null, row) => (
      <Typography.Text
        {...(row.conflicts.managerEmployeeId
          ? { type: "danger" as const }
          : {})}
      >
        {value ?? "—"}
      </Typography.Text>
    ),
    title: "负责人",
  },
  {
    dataIndex: "status",
    render: (value: DepartmentImportPreviewRow["status"], row) => (
      <Typography.Text
        {...(row.conflicts.status ? { type: "danger" as const } : {})}
      >
        {value === "active" ? "启用" : "停用"}
      </Typography.Text>
    ),
    title: "状态",
  },
  {
    render: (_, row) =>
      Object.keys(row.conflicts).length > 0
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

export function DepartmentManagementTab() {
  const { data: rows, error, isPending } = useDepartmentRows();
  const employees = useEmployees();
  const [filters, setFilters] = useState<DepartmentFilterValue>(
    createDefaultDepartmentFilters(),
  );
  const [formState, setFormState] = useState<DepartmentFormState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [membersDepartment, setMembersDepartment] = useState<DepartmentRow | null>(null);
  const membersQuery = useDepartmentMembers(membersDepartment?.departmentId);

  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();
  const syncDepartment = useSyncDepartment();
  const triggerSync = useTriggerSync();
  const applyImport = useApplyDepartmentImport();

  const parentNameMap = useMemo(
    () => new Map(rows?.map((row) => [row.departmentId, row.name]) ?? []),
    [rows],
  );

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    return filterDepartmentRows(rows, filters);
  }, [rows, filters]);

  const departmentOptions = useMemo(
    () =>
      rows?.map((row) => ({
        label: row.name,
        value: row.departmentId,
      })) ?? [],
    [rows],
  );

  const employeeOptions = useMemo(
    () =>
      (employees.data ?? []).map((employee) => ({
        label: `${employee.displayName}（${employee.employeeId}）`,
        value: employee.employeeId,
      })),
    [employees.data],
  );

  if (isPending || error) {
    return (
      <section className="space-y-2 rounded-xl bg-white p-2 text-[13px] text-[#ff4d4f]">
        {isPending && "部门数据加载中..."}
        {error && `部门数据加载失败：${error.message}`}
      </section>
    );
  }

  const handleSubmit = async (values: {
    departmentId?: string;
    name: string;
    parentDepartmentId?: string | null;
    managerEmployeeId?: string | null;
    status: "active" | "disabled";
  }) => {
    if (formState?.mode === "create") {
      await createDepartment.mutateAsync({
        name: values.name,
        ...(values.parentDepartmentId === undefined
          ? {}
          : { parentDepartmentId: values.parentDepartmentId }),
        ...(values.managerEmployeeId === undefined
          ? {}
          : { managerEmployeeId: values.managerEmployeeId }),
        status: values.status,
      });
    } else if (formState?.row !== undefined && formState.row !== null) {
      await updateDepartment.mutateAsync({
        departmentId: formState.row.departmentId,
        input: {
          name: values.name,
          parentDepartmentId: values.parentDepartmentId ?? null,
          managerEmployeeId: values.managerEmployeeId ?? null,
          status: values.status,
        },
      });
    }
    setFormState(null);
  };

  return (
    <section className="space-y-2 rounded-xl bg-white p-2">
      <DepartmentFilterBar
        onBatchImport={() => setImportOpen(true)}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onCreate={() => setFormState({ mode: "create" })}
        onSync={() => triggerSync.mutate()}
        value={filters}
      />
      <DepartmentTable
        onDelete={(row) => {
          Modal.confirm({
            content: `确认删除部门「${row.name}」吗？仅空部门可删除。`,
            onOk: () => deleteDepartment.mutateAsync(row.departmentId),
            title: "删除部门",
          });
        }}
        onDisable={(row) => {
          Modal.confirm({
            content: `确认停用部门「${row.name}」吗？`,
            onOk: () =>
              updateDepartment.mutateAsync({
                departmentId: row.departmentId,
                input: { status: "disabled" },
              }),
            title: "停用部门",
          });
        }}
        onEdit={(row) => setFormState({ mode: "edit", row })}
        onMembers={setMembersDepartment}
        onSync={(row) => syncDepartment.mutateAsync(row.departmentId)}
        parentNameMap={parentNameMap}
        rows={filteredRows}
      />
      <DepartmentFormModal
        departmentOptions={departmentOptions}
        employeeOptions={employeeOptions}
        loading={createDepartment.isPending || updateDepartment.isPending}
        mode={formState?.mode ?? "create"}
        onClose={() => setFormState(null)}
        onSubmit={handleSubmit}
        open={formState !== null}
        row={formState?.row ?? null}
      />
      <DepartmentMembersModal
        members={membersQuery.data ?? []}
        onClose={() => setMembersDepartment(null)}
        open={membersDepartment !== null}
        title={`部门成员：${membersDepartment?.name ?? ""}`}
      />
      <CsvImportModal<DepartmentImportPreviewRow>
        columns={IMPORT_COLUMNS}
        onClose={() => setImportOpen(false)}
        open={importOpen}
        preview={previewDepartmentImport}
        rowKey="departmentId"
        submit={applyImport.mutateAsync}
        title="批量导入部门"
      />
    </section>
  );
}
