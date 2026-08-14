/** 列表接口的统一分页响应；已有数组接口继续保留原 wire shape。 */
export interface PageResult<T> {
  items: readonly T[];
  page: number;
  pageSize: number;
  total: number;
}

export type IsoUtc = string & { readonly __isoUtcBrand: unique symbol };

export type Nullable<T> = T | null;

export type IdempotencyKey = string & {
  readonly __idempotencyKeyBrand: unique symbol;
};
