/**
 * 上游熔断（PRD 8.2 熔断 / 十二 异常清单）。
 *
 * 目的很具体：上游 vLLM 挂掉或过载时，**不要让每个请求都去等一遍超时**——那会把
 * 网关的并发额度（以及用户的等待时间）整片吃掉。熔断打开后立刻返回
 * `503 circuit_open` + `Retry-After`，让调用方快速失败。
 *
 * 状态机（粒度：上游整体，本期只有单个上游）：
 *
 * ```
 * closed ──连续失败次数 ≥ 阈值──► open ──等待 openDurationMs──► half_open
 *    ▲                                                             │
 *    └────────────── 探测成功（1 个请求）───────────────────────────┘
 *                       探测失败 → 回到 open（重新计时）
 * ```
 *
 * - **只把「上游自身故障」计为失败**：超时、网络不可达、5xx。上游 4xx 是请求本身的问题，
 *   上游 429 是它主动给出的节流信号——把这两类计入会让繁忙但健康的上游被误熔断。
 * - 时钟可注入，便于测试确定性推进（不依赖真实等待 30 秒）。
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  /** 熔断打开至何时（毫秒时间戳）；未打开为 null。 */
  openedUntilMs: number | null;
}

export interface UpstreamCircuitBreaker {
  /** 是否放行本次请求（open 期间拒绝；half_open 只放行 1 个探测）。 */
  allow(): boolean;
  onSuccess(): void;
  onFailure(): void;
  state(): CircuitState;
  snapshot(): CircuitSnapshot;
  /** 供 429/503 响应使用：还需等待多久（秒）。 */
  retryAfterSeconds(): number;
}

export interface UpstreamCircuitBreakerOptions {
  /** 连续失败达到该值即打开，默认 5。 */
  failureThreshold?: number;
  /** 打开后多久进入半开，默认 30_000ms。 */
  openDurationMs?: number;
  /** 注入时钟（毫秒），默认 `Date.now`。 */
  now?: () => number;
  /**
   * 状态变更回调（M5 指标埋点）：仅在状态**实际变化**时触发，
   * 读取路径（refresh）不重复触发。初始 closed 不触发（由调用方初始化 gauge）。
   */
  onStateChange?: ((state: CircuitState) => void) | undefined;
}

export function createUpstreamCircuitBreaker(
  options: UpstreamCircuitBreakerOptions = {},
): UpstreamCircuitBreaker {
  const failureThreshold = options.failureThreshold ?? 5;
  const openDurationMs = options.openDurationMs ?? 30_000;
  const now = options.now ?? Date.now;
  const onStateChange = options.onStateChange;

  let state: CircuitState = "closed";
  let consecutiveFailures = 0;
  let openedUntilMs: number | null = null;
  let probeInFlight = false;
  let reported: CircuitState = "closed";

  const report = (): void => {
    if (onStateChange === undefined || reported === state) return;
    reported = state;
    onStateChange(state);
  };

  /** 到期自动进入半开：读取路径统一走这里，避免状态滞后。 */
  const refresh = (): void => {
    if (state === "open" && openedUntilMs !== null && now() >= openedUntilMs) {
      state = "half_open";
      probeInFlight = false;
      report();
    }
  };

  const open = (): void => {
    state = "open";
    openedUntilMs = now() + openDurationMs;
    probeInFlight = false;
    report();
  };

  return {
    allow() {
      refresh();
      if (state === "closed") return true;
      if (state === "open") return false;
      // half_open：只放行一个探测，其余请求快速失败
      if (probeInFlight) return false;
      probeInFlight = true;
      return true;
    },
    onSuccess() {
      // 无论来自半开探测还是正常请求，成功即清零并恢复
      state = "closed";
      consecutiveFailures = 0;
      openedUntilMs = null;
      probeInFlight = false;
      report();
    },
    onFailure() {
      consecutiveFailures += 1;
      probeInFlight = false;
      if (state === "half_open") {
        // 探测失败：重新打开并重新计时
        open();
        return;
      }
      if (consecutiveFailures >= failureThreshold) {
        open();
      }
    },
    state() {
      refresh();
      return state;
    },
    snapshot() {
      refresh();
      return { state, consecutiveFailures, openedUntilMs };
    },
    retryAfterSeconds() {
      refresh();
      if (state !== "open" || openedUntilMs === null) {
        return Math.ceil(openDurationMs / 1000);
      }
      return Math.max(1, Math.ceil((openedUntilMs - now()) / 1000));
    },
  };
}
