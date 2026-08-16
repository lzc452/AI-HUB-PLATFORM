import { useQuery } from "@tanstack/react-query";
import { listRoles } from "../../../../../modules/auth/auth.client";
import type { RoleSummary } from "../constants";

interface UseRoleRowsResult {
  data: RoleSummary[];
  error: Error | null;
  isPending: boolean;
}

/** 从 identity API 查询角色列表；页面不再内置设计稿 mock 数据。 */
export function useRoleRows(): UseRoleRowsResult {
  const query = useQuery({
    queryKey: ["identity", "roles"],
    queryFn: listRoles,
  });
  return {
    data: (query.data ?? []) as RoleSummary[],
    error: query.error,
    isPending: query.isPending,
  };
}
