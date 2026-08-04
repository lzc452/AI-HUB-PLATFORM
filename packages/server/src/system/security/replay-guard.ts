import { createHash } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const NONCE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;

export interface ReplayNonceInput {
  nonce: string;
  actorEmployeeId: string;
  route: string;
  timestamp: string;
}

export interface ReplayNonceRecord {
  nonceHash: string;
  actorEmployeeId: string;
  route: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ReplayNonceStore {
  consume(input: ReplayNonceRecord): Promise<boolean>;
}

export class ReplayGuard {
  public constructor(
    private readonly store: ReplayNonceStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async assertFresh(input: ReplayNonceInput): Promise<void> {
    const createdAt = new Date(input.timestamp);
    const now = this.now();
    if (
      !NONCE_PATTERN.test(input.nonce) ||
      Number.isNaN(createdAt.valueOf()) ||
      Math.abs(now.valueOf() - createdAt.valueOf()) > MAX_CLOCK_SKEW_MS
    ) {
      throw new Error("REPLAY_TIMESTAMP_INVALID");
    }

    const accepted = await this.store.consume({
      nonceHash: createHash("sha256").update(input.nonce).digest("hex"),
      actorEmployeeId: input.actorEmployeeId,
      route: input.route,
      createdAt,
      expiresAt: new Date(createdAt.valueOf() + MAX_CLOCK_SKEW_MS),
    });
    if (!accepted) throw new Error("REPLAY_DETECTED");
  }
}
