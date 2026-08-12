import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  assignEmployeeRoles,
  createDepartment,
  deleteDepartment,
  fetchActor,
  listDepartments,
  listEmployees,
  listEmployeesPage,
  listSyncRuns,
  triggerSync,
  updateDepartment,
  updateEmployee,
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
