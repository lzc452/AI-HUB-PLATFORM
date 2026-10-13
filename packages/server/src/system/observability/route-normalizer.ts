/**
 * 指标 route 标签归一化。
 *
 * Prometheus 标签的取值集合必须是**有限**的：每个新标签值都会新建一条时间序列，
 * 且永不自动过期。把原始 URL 直接当标签用（`/applications/APP-20260901-8472`）
 * 会让攻击者或大客户流量把指标基数推到无穷大——最终不是监控变慢，
 * 而是 Prometheus 磁盘被打满、查询接口超时，进而拖垮整个可观测性体系。
 *
 * 归一化策略（按优先级，先匹配先生效）：
 * 1. **框架路由模板优先**：`request.route.path` 在 Express 路由匹配完成后
 *    才是准确值，形如 `/api/applications/:applicationId`，天然低基数。
 * 2. **路径段启发式**：拿不到模板时按段归一——uuid / 纯数字 / 长十六进制 /
 *    带日期前缀的长标识一律替换为 `:id`，其余段原样保留。
 * 3. **兜底**：以上都失效时退化为 `/unknown`，宁可丢失分辨率，
 *    也不猜出一个可能高基数的值。
 */

/** uuid v1–v5，含连字符与无连字符两种形态。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{32}$/i;
/**
 * ULID：26 位 Crockford Base32（大写，排除 I/L/O/U）。
 *
 * **本项目的主力标识格式**：traceId、发布批次号等都由 `ulid()` 生成，
 * 形如 `01JZ3M8V9Z3V4F2V3K0R4Y8P6S`。只认 uuid 而漏掉 ULID 是最容易犯的错——
 * 归一化"看起来生效了"（长十六进制能兜住一部分），实际却把26 位 ULID
 * 原样放进了标签，基数问题照旧。
 */
const ULID_PATTERN = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
/** 纯数字：数据库自增主键、分页游标等。 */
const NUMERIC_PATTERN = /^\d+$/;
/** 长十六进制：sha256 / git短 hash / token。 */
const HEX_PATTERN = /^[0-9a-f]{16,}$/i;
/**
 * 带日期或序号前缀的业务标识，如 `APP-20260901-8472`、`REQ-20260901-3`。
 * 这些是本项目里基数杀手的主要形态：数量随时间线性增长，永远不会收敛。
 */
const DATED_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*[-_]?\d{6,}[-_]\w+$/;
/** 任意长度的「前缀-数字」组合，覆盖 `user-12345678` 这类形态。 */
const LONG_PREFIXED_NUMERIC_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,15}-\d{4,}$/;
/**
 * 工号：本项目的员工标识形态为「单字母前缀 + 数字」（E001 / E900）。
 *
 * 与上面几条分开写是因为它的数字位数很矮（3位起），
 * 不能并入 `LONG_PREFIXED_NUMERIC_PATTERN`（要求 ≥4 位数字）。
 * `/api/employees/E001` 与 `/api/employees/E900` 是两个不同员工，
 * 员工数一多就是实打实的高基数来源。
 */
const EMPLOYEE_NUMBER_PATTERN = /^[A-Za-z]\d{2,}$/;
/** 单段长度上限：超过即视为不可枚举标识（token、签名等）。 */
const MAX_SEGMENT_LENGTH = 48;
/** 归一化后仍保留的最大段数，防止超长路径把标签撑大。 */
const MAX_SEGMENTS = 24;

export const ROUTE_LABEL_ID = ":id";
export const ROUTE_LABEL_UNKNOWN = "/unknown";

/**
 * 归一化单个路径段。返回原段或 `:id`。
 *
 * 逐段判断而非整体正则替换：`/a/1/b/2` 里如果只替换第一段会漏掉后面的，
 * 而 `/v1/2/3/health` 这类真实路径里又不该把 `v1` 换掉——逐段是唯一能
 * 同时保住「高基数段被替换」和「真实段名被保留」的做法。
 */
function normalizeSegment(segment: string): string {
  if (segment.length === 0) return segment;
  if (
    UUID_PATTERN.test(segment) ||
    ULID_PATTERN.test(segment) ||
    NUMERIC_PATTERN.test(segment) ||
    HEX_PATTERN.test(segment) ||
    DATED_ID_PATTERN.test(segment) ||
    LONG_PREFIXED_NUMERIC_PATTERN.test(segment) ||
    EMPLOYEE_NUMBER_PATTERN.test(segment)
  ) {
    return ROUTE_LABEL_ID;
  }
  if (segment.length > MAX_SEGMENT_LENGTH) return ROUTE_LABEL_ID;
  return segment;
}

/**
 * 把请求路径归一化为低基数的 route 标签。
 *
 * @param url 原始 URL（可以带 query）。带 query 时只取 path 部分——
 *   query 里的搜索词、token、邮箱全是无限取值，绝不能进标签。
 * @param routeTemplate 框架匹配出的路由模板（如 `/api/applications/:applicationId`）。
 *   优先采用，因为它比启发式更准确。
 */
export function normalizeRouteLabel(
  url: string | undefined | null,
  routeTemplate?: string | null,
): string {
  // 模板优先：Express 在路由匹配完成后才有 route.path，此时它就是准确的路由形状。
  if (
    typeof routeTemplate === "string" &&
    routeTemplate.length > 0 &&
    routeTemplate !== "/" &&
    !routeTemplate.includes("*")
  ) {
    return routeTemplate;
  }

  if (typeof url !== "string" || url.length === 0) return ROUTE_LABEL_UNKNOWN;

  let path = url;
  try {
    // 只取 path：query 与 hash 都不属于路由标识。
    path = new URL(url, "http://placeholder.invalid").pathname;
  } catch {
    // url 是相对路径且带非法字符时 URL 解析会抛；退回手工截断到 '?' / '#'。
    path = url.split("#", 1)[0]!.split("?", 1)[0]!;
  }
  if (path.length === 0) return ROUTE_LABEL_UNKNOWN;

  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return "/";
  if (segments.length > MAX_SEGMENTS) return ROUTE_LABEL_UNKNOWN;

  return `/${segments.map(normalizeSegment).join("/")}`;
}
