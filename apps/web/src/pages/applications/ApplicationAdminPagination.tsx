import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Select } from "antd";
import { useMemo } from "react";

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
 * 自定义分页器（与设计稿一致）：左侧共 N 个应用；右侧 1 2 3 4 5 … N + 上/下页 + 每页大小。
 * - 折叠规则：超过 7 页时，隐藏中间多余页码，仅保留首末 + 当前 ±1。
 * - 键盘可达：所有按钮均为 `<button>`，focus-visible 有清晰环。
 * - 受控：分页与每页大小变更均通过回调上抛，组件本身不持有分页状态。
 */
export function ApplicationAdminPagination({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  total,
}: ApplicationAdminPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const items = useMemo(
    () => buildPageItems(safePage, pageCount),
    [pageCount, safePage],
  );

  const canPrev = safePage > 1;
  const canNext = safePage < pageCount;

  return (
    <nav
      aria-label="应用分页"
      className="flex flex-col items-start justify-between gap-3 rounded-b-2xl border-t border-[#f0f0f0] bg-white px-3 py-3 sm:flex-row sm:items-center sm:px-4"
    >
      <p className="m-0 text-xs !text-[#8c8c8c]">
        共 <span className="font-medium !text-[#1f1f1f]">{total}</span> 个应用
      </p>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        <ul
          aria-label="页码"
          className="m-0 flex list-none items-center gap-1 p-0"
        >
          <li>
            <PageArrow
              ariaLabel="上一页"
              disabled={!canPrev}
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
            >
              <LeftOutlined aria-hidden="true" />
            </PageArrow>
          </li>
          {items.map((item, index) => {
            if (item === "…") {
              return (
                <li
                  aria-hidden="true"
                  className="select-none px-2 text-sm !text-[#bfbfbf]"
                  key={`ellipsis-${index}`}
                >
                  …
                </li>
              );
            }
            const isActive = item === safePage;
            return (
              <li key={item}>
                <button
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`第 ${item} 页`}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm transition-colors duration-150 ${
                    isActive
                      ? "bg-[#1677ff] !text-white shadow-sm"
                      : "!text-[#1f1f1f] hover:bg-[#f0f7ff] hover:!text-[#1677ff]"
                  }`}
                  onClick={() => onPageChange(item)}
                  type="button"
                >
                  {item}
                </button>
              </li>
            );
          })}
          <li>
            <PageArrow
              ariaLabel="下一页"
              disabled={!canNext}
              onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
            >
              <RightOutlined aria-hidden="true" />
            </PageArrow>
          </li>
        </ul>

        <Select<number>
          aria-label="每页条数"
          className="!w-24"
          onChange={(value) => onPageSizeChange(value)}
          options={pageSizeOptions.map((size) => ({
            label: `${size} 条/页`,
            value: size,
          }))}
          value={pageSize}
        />
      </div>
    </nav>
  );
}

function PageArrow({
  ariaLabel,
  children,
  disabled,
  onClick,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#d9d9d9] bg-white text-sm !text-[#595959] transition-all duration-150 hover:border-[#1677ff] hover:!text-[#1677ff] active:translate-y-px disabled:cursor-not-allowed disabled:!text-[#bfbfbf] disabled:hover:border-[#d9d9d9] disabled:hover:!text-[#bfbfbf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]/30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function buildPageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const items: (number | "…")[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  items.push(1);
  if (left > 2) {
    items.push("…");
  }
  for (let page = left; page <= right; page += 1) {
    items.push(page);
  }
  if (right < total - 1) {
    items.push("…");
  }
  items.push(total);
  return items;
}
