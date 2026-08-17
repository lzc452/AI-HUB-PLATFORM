import { Pagination } from "antd";

export interface ApplicationAdminPaginationProps {
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  total: number;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

/**
 * 应用管理分页器：antd Pagination + 左侧总数提示。
 * 分页与每页大小变更均通过回调上抛，组件本身不持有分页状态。
 */
export function ApplicationAdminPagination({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  total,
}: ApplicationAdminPaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-[#f0f0f0] bg-white px-3 py-3 sm:px-4">
      <p className="m-0 text-xs !text-[#8c8c8c]">
        共<span className="font-medium !text-[#1f1f1f]">{total}</span> 个应用
      </p>
      <Pagination
        current={page}
        onChange={(nextPage, nextPageSize) => {
          if (nextPageSize !== pageSize) {
            onPageSizeChange(nextPageSize);
          }
          onPageChange(nextPage);
        }}
        pageSize={pageSize}
        pageSizeOptions={[...pageSizeOptions]}
        showSizeChanger
        total={total}
      />
    </div>
  );
}
