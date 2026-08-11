import dayjs from "dayjs";
import { useMemo } from "react";

import type { AuditLogRow } from "../../../../modules/security";

import { type AuditFilterValue } from "../constants";

/**
 * 纯派生 hook：筛选条件 → 表格行。
 * 不引入任何本地可变状态，仅依赖入参，保证全页面派生数据来自同一计算路径。
 */
export function useAuditLogRows(
  rows: AuditLogRow[],
  filters: AuditFilterValue,
): AuditLogRow[] {
  return useMemo(() => {
    const [start, end] = filters.range ?? [null, null];
    // 结束时间包含所选分钟的第 59 秒，避免「23:59」漏掉当分钟数据
    const endTs = end ? end.add(59, "second").valueOf() : null;
    const startTs = start ? start.valueOf() : null;
    const keyword = filters.searchText.trim().toLowerCase();

    return rows.filter((row) => {
      const ts = dayjs(row.time).valueOf();
      const matchesRange =
        (startTs === null || ts >= startTs) && (endTs === null || ts <= endTs);
      const matchesAction =
        !filters.actionType || row.actionType === filters.actionType;
      const matchesOperator =
        !filters.operator || row.operatorName === filters.operator;
      const matchesModule = !filters.module || row.module === filters.module;
      const matchesKeyword =
        !keyword ||
        row.traceId.toLowerCase().includes(keyword) ||
        row.summary.toLowerCase().includes(keyword);
      return (
        matchesRange &&
        matchesAction &&
        matchesOperator &&
        matchesModule &&
        matchesKeyword
      );
    });
  }, [rows, filters]);
}
