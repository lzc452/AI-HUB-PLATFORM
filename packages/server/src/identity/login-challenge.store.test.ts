import { describe, expect, it } from "vitest";
import { InMemoryLoginChallengeStore } from "./login-challenge.store.js";

describe("InMemoryLoginChallengeStore", () => {
  it("只允许消费已签发、未过期且 keyId 匹配的 challenge", async () => {
    let now = new Date("2026-08-12T00:00:00.000Z");
    const store = new InMemoryLoginChallengeStore(() => now);

    const expiresAt = await store.issue({
      nonceHash: "a".repeat(64),
      keyId: "key-a",
      ttlMs: 5 * 60 * 1000,
    });

    expect(expiresAt).toEqual(new Date("2026-08-12T00:05:00.000Z"));
    expect(
      await store.consume({ nonceHash: "a".repeat(64), keyId: "key-b" }),
    ).toBe(false);
    expect(
      await store.consume({ nonceHash: "a".repeat(64), keyId: "key-a" }),
    ).toBe(true);
    expect(
      await store.consume({ nonceHash: "a".repeat(64), keyId: "key-a" }),
    ).toBe(false);

    await store.issue({
      nonceHash: "b".repeat(64),
      keyId: "key-a",
      ttlMs: 5 * 60 * 1000,
    });
    now = new Date("2026-08-12T00:05:00.001Z");
    expect(
      await store.consume({ nonceHash: "b".repeat(64), keyId: "key-a" }),
    ).toBe(false);
  });

  it("拒绝从未签发的 nonce", async () => {
    const store = new InMemoryLoginChallengeStore();

    expect(
      await store.consume({ nonceHash: "c".repeat(64), keyId: "key-a" }),
    ).toBe(false);
  });
});
