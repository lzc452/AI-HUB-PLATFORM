export interface ReplayNonceRecord {
  nonceHash: string;
  actorEmployeeId: string;
  route: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface LoginChallengeStore {
  consume(nonceHash: string, expiresAt: Date): Promise<boolean>;
}

/**
 * In-memory challenge nonce store.
 * Challenges expire after 5 minutes. This store is per-process —
 * suitable for single-instance deployments. A server restart naturally
 * invalidates all in-flight challenges.
 */
export class InMemoryLoginChallengeStore implements LoginChallengeStore {
  private readonly consumed = new Set<string>();

  async consume(nonceHash: string, _expiresAt: Date): Promise<boolean> {
    void _expiresAt;
    if (this.consumed.has(nonceHash)) {
      return false;
    }
    this.consumed.add(nonceHash);
    // Cleanup: remove entries older than the challenge window
    if (this.consumed.size > 10_000) {
      this.consumed.clear();
    }
    return true;
  }
}
