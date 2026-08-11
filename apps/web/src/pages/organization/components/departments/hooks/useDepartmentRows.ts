import { DEPARTMENTS_MOCK_DATA, type DepartmentRow } from "../constants";

interface UseDepartmentRowsResult {
  data: DepartmentRow[];
  error: Error | null;
  isPending: boolean;
}

/**
 * 部门列表数据源。
 * 当前后端未提供完整部门字段（负责人、成员数、关联应用、同步时间等），
 * 使用与设计图完全对齐的 mock 数据；接口就绪后，只需把这里的实现替换为
 * react-query useQuery，组件层无需改动。
 */
export function useDepartmentRows(): UseDepartmentRowsResult {
  return {
    data: DEPARTMENTS_MOCK_DATA,
    error: null,
    isPending: false,
  };
}
