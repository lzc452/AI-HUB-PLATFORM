import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  assignEmployeeRoles,
  archiveEmployee,
  applyDepartmentImport,
  applyEmployeeImport,
  bulkDisableEmployees,
  bulkDisableRoles,
  cancelSyncRun,
  copyRole,
  createEmployee,
  createDepartment,
  createRole,
  deleteDepartment,
  deleteRole,
  disableRole,
  fetchActor,
  getRoleDetail,
  listDepartmentMembers,
  listDepartments,
  listEmployees,
  listEmployeesPage,
  listPermissionCatalog,
  listRoleTemplates,
  listSyncRuns,
  listSyncRunItems,
  resetEmployeePassword,
  retrySyncRun,
  syncDepartment,
  triggerSync,
  updateDepartment,
  updateEmployee,
  updateRole,
} from "./auth.client";
import { showErrorMessage, showSuccessMessage } from "../../shared/ui/message";

export function useActor() {
  return useQuery({
    queryFn: fetchActor,
    queryKey: ["identity", "actor"],
  });
}

export function useEmployees() {
  return useQuery({
    queryFn: listEmployees,
    queryKey: ["identity", "employees"],
  });
}

export function useDepartments() {
  return useQuery({
    queryFn: listDepartments,
    queryKey: ["identity", "departments"],
  });
}

export function useEmployeePage(input?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryFn: () => listEmployeesPage(input),
    queryKey: ["identity", "employees-page", input?.keyword, input?.page],
  });
}

export function useSyncRuns(limit = 20) {
  return useQuery({
    queryFn: () => listSyncRuns(limit),
    queryKey: ["identity", "sync-runs"],
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryFn: listPermissionCatalog,
    queryKey: ["identity", "permission-catalog"],
  });
}

export function useRoleTemplates() {
  return useQuery({
    queryFn: listRoleTemplates,
    queryKey: ["identity", "role-templates"],
  });
}

export function useRoleDetail(roleId?: string) {
  return useQuery({
    queryFn: () => getRoleDetail(roleId!),
    queryKey: ["identity", "role", roleId],
    enabled: roleId !== undefined,
  });
}

export function useDepartmentMembers(departmentId?: string) {
  return useQuery({
    queryFn: () => listDepartmentMembers(departmentId!),
    queryKey: ["identity", "department-members", departmentId],
    enabled: departmentId !== undefined,
  });
}

export function useSyncRunItems(runId?: string) {
  return useQuery({
    queryFn: () => listSyncRunItems(runId!),
    queryKey: ["identity", "sync-run-items", runId],
    enabled: runId !== undefined,
  });
}

function useInvalidateIdentity() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["identity"] }),
      queryClient.invalidateQueries({ queryKey: ["security"] }),
    ]);
}

export function useUpdateEmployee() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: ({
      employeeId,
      input,
    }: {
      employeeId: string;
      input: Parameters<typeof updateEmployee>[1];
    }) => updateEmployee(employeeId, input),
    onError: (error) => showErrorMessage(error, "更新员工失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("员工信息已更新");
    },
  });
}

export function useAssignEmployeeRoles() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: ({
      employeeId,
      roleCodes,
    }: {
      employeeId: string;
      roleCodes: string[];
    }) => assignEmployeeRoles(employeeId, roleCodes),
    onError: (error) => showErrorMessage(error, "角色分配失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("角色已分配");
    },
  });
}

export function useCreateDepartment() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (input: Parameters<typeof createDepartment>[0]) =>
      createDepartment(input),
    onError: (error) => showErrorMessage(error, "创建部门失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("部门已创建");
    },
  });
}

export function useUpdateDepartment() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: ({
      departmentId,
      input,
    }: {
      departmentId: string;
      input: Parameters<typeof updateDepartment>[1];
    }) => updateDepartment(departmentId, input),
    onError: (error) => showErrorMessage(error, "更新部门失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("部门已更新");
    },
  });
}

export function useDeleteDepartment() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (departmentId: string) => deleteDepartment(departmentId),
    onError: (error) => showErrorMessage(error, "删除部门失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("部门已删除");
    },
  });
}

export function useTriggerSync() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: () => triggerSync(),
    onError: (error) => showErrorMessage(error, "触发同步失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("同步任务已创建");
    },
  });
}

export function useCreateEmployee() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (input: Parameters<typeof createEmployee>[0]) =>
      createEmployee(input),
    onError: (error) => showErrorMessage(error, "创建用户失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("用户已创建");
    },
  });
}

export function useArchiveEmployee() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (employeeId: string) => archiveEmployee(employeeId),
    onError: (error) => showErrorMessage(error, "删除用户失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("用户已删除");
    },
  });
}

export function useBulkDisableEmployees() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (employeeIds: string[]) => bulkDisableEmployees(employeeIds),
    onError: (error) => showErrorMessage(error, "批量停用失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("用户已停用");
    },
  });
}

export function useResetEmployeePassword() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: ({
      employeeId,
      newPassword,
    }: {
      employeeId: string;
      newPassword: string;
    }) => resetEmployeePassword(employeeId, newPassword),
    onError: (error) => showErrorMessage(error, "重置密码失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("密码已重置");
    },
  });
}

export function useApplyEmployeeImport() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (input: Parameters<typeof applyEmployeeImport>[0]) =>
      applyEmployeeImport(input),
    onError: (error) => showErrorMessage(error, "用户导入失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("用户导入完成");
    },
  });
}

export function useSyncDepartment() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (departmentId: string) => syncDepartment(departmentId),
    onError: (error) => showErrorMessage(error, "部门同步失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("部门同步任务已创建");
    },
  });
}

export function useApplyDepartmentImport() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (input: Parameters<typeof applyDepartmentImport>[0]) =>
      applyDepartmentImport(input),
    onError: (error) => showErrorMessage(error, "部门导入失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("部门导入完成");
    },
  });
}

export function useCreateRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (input: Parameters<typeof createRole>[0]) => createRole(input),
    onError: (error) => showErrorMessage(error, "创建角色失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("角色已创建");
    },
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: ({
      roleId,
      input,
    }: {
      roleId: string;
      input: Parameters<typeof updateRole>[1];
    }) => updateRole(roleId, input),
    onError: (error) => showErrorMessage(error, "更新角色失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("角色已更新");
    },
  });
}

export function useDisableRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (roleId: string) => disableRole(roleId),
    onError: (error) => showErrorMessage(error, "停用角色失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("角色已停用");
    },
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onError: (error) => showErrorMessage(error, "删除角色失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("角色已删除");
    },
  });
}

export function useBulkDisableRoles() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (roleIds: string[]) => bulkDisableRoles(roleIds),
    onError: (error) => showErrorMessage(error, "批量停用角色失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("角色已停用");
    },
  });
}

export function useCopyRole() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: ({
      roleId,
      input,
    }: {
      roleId: string;
      input: Parameters<typeof copyRole>[1];
    }) => copyRole(roleId, input),
    onError: (error) => showErrorMessage(error, "复制角色失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("角色已复制");
    },
  });
}

export function useRetrySyncRun() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (runId: string) => retrySyncRun(runId),
    onError: (error) => showErrorMessage(error, "重试同步失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("同步任务已重试");
    },
  });
}

export function useCancelSyncRun() {
  const invalidate = useInvalidateIdentity();
  return useMutation({
    mutationFn: (runId: string) => cancelSyncRun(runId),
    onError: (error) => showErrorMessage(error, "取消同步失败"),
    onSuccess: async () => {
      await invalidate();
      showSuccessMessage("同步任务已取消");
    },
  });
}
