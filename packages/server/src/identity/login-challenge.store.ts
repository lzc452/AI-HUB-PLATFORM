export interface ReplayNonceRecord {
  nonceHash: string;
  actorEmployeeId: string;
  route: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface LoginChallengeStore {
  issue(input: {
    nonceHash: string;
    keyId: string;
    ttlMs: number;
  }): Promise<Date>;
  consume(input: { nonceHash: string; keyId: string }): Promise<boolean>;
}

/**
 * In-memory challenge nonce store.
 * Challenges expire after 5 minutes. This store is per-process —
 * suitable for single-instance deployments. A server restart naturally
 * invalidates all in-flight challenges.
 */
export class InMemoryLoginChallengeStore implements LoginChallengeStore {
  private readonly challenges = new Map<
    string,
    { keyId: string; expiresAt: Date; consumed: boolean }
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async issue(input: {
    nonceHash: string;
    keyId: string;
    ttlMs: number;
  }): Promise<Date> {
    const expiresAt = new Date(this.now().getTime() + input.ttlMs);
    this.challenges.set(input.nonceHash, {
      keyId: input.keyId,
      expiresAt,
      consumed: false,
    });
    return expiresAt;
  }

  async consume(input: { nonceHash: string; keyId: string }): Promise<boolean> {
    const challenge = this.challenges.get(input.nonceHash);
    if (
      challenge === undefined ||
      challenge.keyId !== input.keyId ||
      challenge.consumed ||
      challenge.expiresAt.getTime() <= this.now().getTime()
    ) {
      return false;
    }
    challenge.consumed = true;
    return true;
  }
}
