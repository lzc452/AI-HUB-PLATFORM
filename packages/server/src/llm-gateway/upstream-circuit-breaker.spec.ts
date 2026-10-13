import { describe, expect, it } from "vitest";
import { createUpstreamCircuitBreaker } from "./upstream-circuit-breaker.js";

/**
 * 熔断状态机（PRD 8.2）。时钟注入，测试直接推进时间，不依赖真实等待。
 */
describe("上游熔断器", () => {
  function breaker(options: { threshold?: number; openMs?: number } = {}) {
    let nowMs = 0;
    const instance = createUpstreamCircuitBreaker({
      failureThreshold: options.threshold ?? 3,
      openDurationMs: options.openMs ?? 30_000,
      now: () => nowMs,
    });
    return {
      instance,
      advance: (ms: number) => {
        nowMs += ms;
      },
    };
  }

  it("关闭态放行；成功不改变状态", () => {
    const { instance } = breaker();
    expect(instance.state()).toBe("closed");
    expect(instance.allow()).toBe(true);
    instance.onSuccess();
    expect(instance.state()).toBe("closed");
    expect(instance.snapshot().consecutiveFailures).toBe(0);
  });

  it("连续失败达到阈值即打开，期间的请求快速失败", () => {
    const { instance } = breaker({ threshold: 3 });
    instance.onFailure();
    instance.onFailure();
    expect(instance.state()).toBe("closed");
    instance.onFailure();
    expect(instance.state()).toBe("open");
    expect(instance.allow()).toBe(false);
    expect(instance.retryAfterSeconds()).toBe(30);
  });

  it("成功会清零连续失败计数（不需要等到窗口结束）", () => {
    const { instance } = breaker({ threshold: 3 });
    instance.onFailure();
    instance.onFailure();
    instance.onSuccess();
    instance.onFailure();
    instance.onFailure();
    expect(instance.state()).toBe("closed");
  });

  it("打开时长到期后进入半开，只放行一个探测", () => {
    const { instance, advance } = breaker({ threshold: 1, openMs: 1_000 });
    instance.onFailure();
    expect(instance.state()).toBe("open");

    advance(999);
    expect(instance.allow()).toBe(false);

    advance(1);
    expect(instance.state()).toBe("half_open");
    expect(instance.allow()).toBe(true); // 探测
    expect(instance.allow()).toBe(false); // 其余请求仍快速失败
  });

  it("半开探测成功即恢复关闭态", () => {
    const { instance, advance } = breaker({ threshold: 1, openMs: 1_000 });
    instance.onFailure();
    advance(1_000);
    expect(instance.allow()).toBe(true);
    instance.onSuccess();
    expect(instance.state()).toBe("closed");
    expect(instance.allow()).toBe(true);
    expect(instance.snapshot().consecutiveFailures).toBe(0);
  });

  it("半开探测失败则重新打开并重新计时", () => {
    const { instance, advance } = breaker({ threshold: 1, openMs: 1_000 });
    instance.onFailure();
    advance(1_000);
    expect(instance.allow()).toBe(true);
    instance.onFailure();
    expect(instance.state()).toBe("open");
    expect(instance.retryAfterSeconds()).toBe(1);
    advance(1_000);
    expect(instance.state()).toBe("half_open");
  });

  it("快照与剩余时间接口一致", () => {
    const { instance, advance } = breaker({ threshold: 2, openMs: 10_000 });
    instance.onFailure();
    instance.onFailure();
    expect(instance.snapshot()).toMatchObject({
      state: "open",
      consecutiveFailures: 2,
    });
    advance(4_000);
    expect(instance.retryAfterSeconds()).toBe(6);
    advance(6_000);
    expect(instance.snapshot()).toMatchObject({ state: "half_open" });
  });
});
