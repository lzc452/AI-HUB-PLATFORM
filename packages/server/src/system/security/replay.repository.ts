import type { Kysely } from "kysely";
import type { DatabaseSchema } from "@ai-hub/database";
import type { ReplayNonceRecord, ReplayNonceStore } from "./replay-guard.js";

export class KyselyReplayNonceRepository implements ReplayNonceStore {
  public constructor(private readonly db: Kysely<DatabaseSchema>) {}

  public async consume(input: ReplayNonceRecord): Promise<boolean> {
    const inserted = await this.db
      .insertInto("request_replay_nonces")
      .values({
        nonce_hash: input.nonceHash,
        actor_employee_id: input.actorEmployeeId,
        route: input.route,
        created_at: input.createdAt,
        expires_at: input.expiresAt,
      })
      .onConflict((conflict) => conflict.column("nonce_hash").doNothing())
      .returning("nonce_hash")
      .executeTakeFirst();

    await this.db
      .deleteFrom("request_replay_nonces")
      .where("expires_at", "<", new Date())
      .execute();

    return inserted !== undefined;
  }
}
