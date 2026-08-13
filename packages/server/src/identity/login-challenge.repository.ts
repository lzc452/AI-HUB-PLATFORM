import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "@ai-hub/database";
import type { LoginChallengeStore } from "./login-challenge.store.js";

export class KyselyLoginChallengeRepository implements LoginChallengeStore {
  constructor(private readonly db: Kysely<DatabaseSchema>) {}

  async issue(input: {
    nonceHash: string;
    keyId: string;
    ttlMs: number;
  }): Promise<Date> {
    const row = await this.db
      .insertInto("login_challenges")
      .values({
        nonce_hash: input.nonceHash,
        key_id: input.keyId,
        expires_at: sql<Date>`now() + (${input.ttlMs} * interval '1 millisecond')`,
      })
      .returning("expires_at")
      .executeTakeFirstOrThrow();
    return row.expires_at;
  }

  async consume(input: { nonceHash: string; keyId: string }): Promise<boolean> {
    const consumed = await this.db
      .updateTable("login_challenges")
      .set({ consumed_at: (eb) => eb.fn("now") })
      .where("nonce_hash", "=", input.nonceHash)
      .where("key_id", "=", input.keyId)
      .where("consumed_at", "is", null)
      .where("expires_at", ">", (eb) => eb.fn("now"))
      .returning("nonce_hash")
      .executeTakeFirst();

    await this.db
      .deleteFrom("login_challenges")
      .where("expires_at", "<", (eb) => eb.fn("now"))
      .execute();

    return consumed !== undefined;
  }
}
