import { ROLES_MOCK_DATA, type RoleSummary } from "../constants";

interface UseRoleRowsResult {
  data: RoleSummary[];
  error: Error | null;
  isPending: boolean;
}

/**
 * 角色列表数据源。
 * 当前后端未提供角色接口，使用与设计图完全对齐的 mock 数据；
 * 接口就绪后，只需把这里的实现替换为 react-query useQuery，组件层无需改动。
 */
export function useRoleRows(): UseRoleRowsResult {
  return {
    data: ROLES_MOCK_DATA,
    error: null,
    isPending: false,
  };
}
