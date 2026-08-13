import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase, runMigrations } from "@ai-hub/database";
import { startPostgresTestContainer } from "@ai-hub/testing";
import { KyselyLoginChallengeRepository } from "@ai-hub/server";

describe("real login challenge repository", () => {
  let db: ReturnType<typeof createDatabase>;
  let stop: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await startPostgresTestContainer();
    stop = container.stop;
    db = createDatabase(container.databaseUrl);
    await runMigrations(db);
  }, 60_000);

  afterAll(async () => {
    try {
      await db?.destroy();
    } finally {
      await stop?.();
    }
  }, 60_000);

  it("跨 repository 并发消费时只有一个调用者成功", async () => {
    const first = new KyselyLoginChallengeRepository(db);
    const second = new KyselyLoginChallengeRepository(db);
    const nonceHash = "d".repeat(64);

    const expiresAt = await first.issue({
      nonceHash,
      keyId: "key-a",
      ttlMs: 5 * 60 * 1000,
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const results = await Promise.all([
      first.consume({ nonceHash, keyId: "key-a" }),
      second.consume({ nonceHash, keyId: "key-a" }),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it("拒绝错误 keyId、过期 challenge 与未知 nonce", async () => {
    const repository = new KyselyLoginChallengeRepository(db);
    const wrongKeyNonce = "e".repeat(64);
    await repository.issue({
      nonceHash: wrongKeyNonce,
      keyId: "key-a",
      ttlMs: 5 * 60 * 1000,
    });
    expect(
      await repository.consume({ nonceHash: wrongKeyNonce, keyId: "key-b" }),
    ).toBe(false);

    const expiredNonce = "f".repeat(64);
    await sql`
      insert into login_challenges (
        nonce_hash,
        key_id,
        expires_at
      ) values (
        ${expiredNonce},
        'key-a',
        now() - interval '1 second'
      )
    `.execute(db);
    expect(
      await repository.consume({ nonceHash: expiredNonce, keyId: "key-a" }),
    ).toBe(false);
    expect(
      await repository.consume({ nonceHash: "0".repeat(64), keyId: "key-a" }),
    ).toBe(false);
  });
});
