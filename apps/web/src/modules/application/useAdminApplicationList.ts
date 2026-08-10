import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AdminApplicationListParams,
  type AdminApplicationListResult,
  getAdminApplicationList,
} from "./adminList.client";
import type { AdminApplicationFilterMode } from "./adminListMeta";

export type AdminApplicationSort = NonNullable<
  AdminApplicationListParams["sort"]
>;

export interface UseAdminApplicationListParams {
  keyword?: string;
  mode?: AdminApplicationFilterMode;
  status?: string;
  departmentId?: string;
  applicationType?: string;
  channel?: AdminApplicationListParams["channel"];
  sort?: AdminApplicationSort;
  page?: number;
  pageSize?: number;
}

export interface UseAdminApplicationListResult {
  data: AdminApplicationListResult | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  keyword: string;
  setKeyword: (value: string) => void;
  filters: {
    mode: AdminApplicationFilterMode;
    setMode: (value: AdminApplicationFilterMode) => void;
    status: string;
    setStatus: (value: string) => void;
    departmentId: string;
    setDepartmentId: (value: string) => void;
    applicationType: string;
    setApplicationType: (value: string) => void;
    channel: AdminApplicationListParams["channel"];
    setChannel: (value: AdminApplicationListParams["channel"]) => void;
    sort: AdminApplicationSort;
    setSort: (value: AdminApplicationSort) => void;
    reset: () => void;
  };
  page: number;
  setPage: (value: number) => void;
  pageSize: number;
  setPageSize: (value: number) => void;
  refetch: () => void;
}

const QUERY_KEY = ["applications", "admin-list"] as const;

const DEFAULT_FILTERS = {
  applicationType: "all",
  channel: undefined as AdminApplicationListParams["channel"],
  departmentId: "all",
  mode: "all" as AdminApplicationFilterMode,
  sort: "recent" as AdminApplicationSort,
  status: "all",
};

/**
 * 应用管理列表数据 hook。
 * 1. 内部维护筛选/分页 UI 状态；
 * 2. 通过 react-query 订阅缓存（KEY：applications / admin-list）；
 * 3. 任何筛选条件变化时自动回到第一页，避免空页停留。
 */
export function useAdminApplicationList(
  initial: UseAdminApplicationListParams = {},
): UseAdminApplicationListResult {
  const [keyword, setKeyword] = useState(initial.keyword ?? "");
  const [mode, setMode] = useState<AdminApplicationFilterMode>(
    initial.mode ?? DEFAULT_FILTERS.mode,
  );
  const [status, setStatus] = useState(initial.status ?? DEFAULT_FILTERS.status);
  const [departmentId, setDepartmentId] = useState(
    initial.departmentId ?? DEFAULT_FILTERS.departmentId,
  );
  const [applicationType, setApplicationType] = useState(
    initial.applicationType ?? DEFAULT_FILTERS.applicationType,
  );
  const [channel, setChannel] = useState<AdminApplicationListParams["channel"]>(
    initial.channel ?? DEFAULT_FILTERS.channel,
  );
  const [sort, setSort] = useState<AdminApplicationSort>(
    initial.sort ?? DEFAULT_FILTERS.sort,
  );
  const [page, setPage] = useState(initial.page ?? 1);
  const [pageSize, setPageSize] = useState(initial.pageSize ?? 10);
  const queryClient = useQueryClient();

  // 任何筛选/排序变化时回到第一页，避免空页停留。
  useEffect(() => {
    setPage(1);
  }, [
    keyword,
    mode,
    status,
    departmentId,
    applicationType,
    channel,
    sort,
    pageSize,
  ]);

  const params: AdminApplicationListParams = useMemo(() => {
    const base: AdminApplicationListParams = {
      applicationType,
      departmentId,
      keyword,
      mode,
      page,
      pageSize,
      sort,
      status,
    };
    if (channel !== undefined) {
      base.channel = channel;
    }
    return base;
  }, [
    applicationType,
    channel,
    departmentId,
    keyword,
    mode,
    page,
    pageSize,
    sort,
    status,
  ]);

  const query = useQuery({
    queryFn: () => getAdminApplicationList(params),
    queryKey: [...QUERY_KEY, params] as const,
  });

  const reset = useCallback(() => {
    setKeyword("");
    setMode(DEFAULT_FILTERS.mode);
    setStatus(DEFAULT_FILTERS.status);
    setDepartmentId(DEFAULT_FILTERS.departmentId);
    setApplicationType(DEFAULT_FILTERS.applicationType);
    setChannel(DEFAULT_FILTERS.channel);
    setSort(DEFAULT_FILTERS.sort);
  }, []);

  return {
    data: query.data,
    error: query.error,
    isError: query.isError,
    isPending: query.isPending,
    isFetching: query.isFetching,
    keyword,
    setKeyword,
    filters: {
      mode,
      setMode,
      status,
      setStatus,
      departmentId,
      setDepartmentId,
      applicationType,
      setApplicationType,
      channel,
      setChannel,
      sort,
      setSort,
      reset,
    },
    page,
    setPage,
    pageSize,
    setPageSize,
    refetch: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  };
}
