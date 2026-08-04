import { describe, expect, it } from "vitest";
import { ReplayGuard, type ReplayNonceStore } from "./replay-guard.js";

describe("ReplayGuard", () => {
  it("accepts a nonce once and rejects a duplicate until expiry", async () => {
    const seen = new Set<string>();
    const store: ReplayNonceStore = {
      async consume(input) {
        if (seen.has(input.nonceHash)) return false;
        seen.add(input.nonceHash);
        return true;
      },
    };
    const guard = new ReplayGuard(
      store,
      () => new Date("2026-08-04T10:00:00Z"),
    );
    const request = {
      nonce: "nonce-1234567890",
      actorEmployeeId: "E100",
      route: "/internal/analytics/exports",
      timestamp: "2026-08-04T09:59:30Z",
    };

    await expect(guard.assertFresh(request)).resolves.toBeUndefined();
    await expect(guard.assertFresh(request)).rejects.toThrow("REPLAY_DETECTED");
  });

  it("rejects stale or malformed nonce timestamps", async () => {
    const guard = new ReplayGuard({ consume: async () => true });

    await expect(
      guard.assertFresh({
        nonce: "short",
        actorEmployeeId: "E100",
        route: "/internal/analytics/exports",
        timestamp: "2026-08-04T08:00:00Z",
      }),
    ).rejects.toThrow("REPLAY_TIMESTAMP_INVALID");
  });
});
