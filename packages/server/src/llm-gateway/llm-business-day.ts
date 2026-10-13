/**
 * 业务日口径（PRD 9.4）。
 *
 * 业务日 = `Asia/Shanghai` 自然日。**上海无夏令时**，与 UTC 的偏移恒为 +08:00，
 * 因此这里用固定偏移做纯算术，不需要数据库时区函数、也不受服务器/会话时区影响。
 *
 * 该函数与 PRD 给出的 SQL 表达式（`date_trunc('day', now() at time zone 'Asia/Shanghai')
 * at time zone 'Asia/Shanghai'`）语义等价——集成测试里用真库对该等价性做了断言，
 * 避免「代码一套口径、SQL 一套口径」的经典分裂。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 返回给定时刻所属业务日的**起始 UTC 时刻**。
 *
 * 例：`2026-10-13T00:30:00+08:00`（= `2026-10-12T16:30:00Z`）→ `2026-10-12T16:00:00Z`
 * （即上海 2026-10-13 00:00）。
 */
export function businessDayStart(at: Date): Date {
  const shifted = at.getTime() + SHANGHAI_OFFSET_MS;
  const startOfDayShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(startOfDayShifted - SHANGHAI_OFFSET_MS);
}

/** 下一个业务日零点（UTC 时刻）：日配额耗尽后的 `Retry-After` 依据。 */
export function nextBusinessDayStart(at: Date): Date {
  return new Date(businessDayStart(at).getTime() + DAY_MS);
}

/** 距下一个业务日零点的剩余秒数，取整向上，上限 86400（PRD 8.2 口径）。 */
export function secondsUntilNextBusinessDay(at: Date): number {
  const remainingMs = nextBusinessDayStart(at).getTime() - at.getTime();
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return Math.min(seconds, 86_400);
}

/** 业务日标识（`YYYY-MM-DD`，上海当地日期），用于日志与聚合键。 */
export function businessDayKey(at: Date): string {
  return new Date(at.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}
