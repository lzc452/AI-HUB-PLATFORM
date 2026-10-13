import { describe, expect, it } from "vitest";
import { API_KEY_FORMAT, createApiKeyHasher } from "./api-key.hasher.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const PREVIOUS = "fedcba9876543210fedcba9876543210";

describe("API Key 摘要器（PRD 10.1）", () => {
  it("生成的明文符合 sk-aihub- 前缀与固定长度，前缀取前 16 字符", () => {
    const hasher = createApiKeyHasher({ secret: SECRET });
    const generated = hasher.generate();

    expect(generated.plaintext.startsWith(API_KEY_FORMAT.prefix)).toBe(true);
    expect(generated.plaintext).toHaveLength(
      API_KEY_FORMAT.prefix.length + API_KEY_FORMAT.tokenLength,
    );
    expect(generated.prefix).toHaveLength(API_KEY_FORMAT.displayLength);
    expect(generated.plaintext.startsWith(generated.prefix)).toBe(true);
  });

  it("明文不含前缀之外的敏感信息，且高熵（1000 次生成无重复）", () => {
    const hasher = createApiKeyHasher({ secret: SECRET });
    const seen = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      seen.add(hasher.generate().plaintext);
    }
    expect(seen.size).toBe(1000);
  });

  it("摘要稳定且与明文不同（不落库明文）", () => {
    const hasher = createApiKeyHasher({ secret: SECRET });
    const generated = hasher.generate();

    expect(hasher.hash(generated.plaintext)).toBe(generated.hash);
    expect(generated.hash).toHaveLength(64);
    expect(generated.hash).not.toContain(generated.plaintext);
    expect(generated.hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("校验只接受对应明文（摘要不匹配即失败）", () => {
    const hasher = createApiKeyHasher({ secret: SECRET });
    const first = hasher.generate();
    const second = hasher.generate();

    expect(hasher.verify(first.plaintext, first.hash)).toBe(true);
    expect(hasher.verify(second.plaintext, first.hash)).toBe(false);
    expect(hasher.verify(first.plaintext, "0".repeat(64))).toBe(false);
  });

  it("双密钥过渡期：用旧密钥签发的 Key 仍可通过校验", () => {
    const oldHasher = createApiKeyHasher({ secret: PREVIOUS });
    const legacy = oldHasher.generate();

    const rotating = createApiKeyHasher({
      secret: SECRET,
      previousSecret: PREVIOUS,
    });
    expect(rotating.verify(legacy.plaintext, legacy.hash)).toBe(true);
    // 新密钥下的摘要与旧摘要不同，但都在候选集合里（供按哈希查库）
    expect(rotating.candidateHashes(legacy.plaintext)).toContain(legacy.hash);
    expect(rotating.candidateHashes(legacy.plaintext)).toHaveLength(2);
  });

  it("过渡期结束后（不传旧密钥）旧 Key 校验失败", () => {
    const legacy = createApiKeyHasher({ secret: PREVIOUS }).generate();
    const current = createApiKeyHasher({ secret: SECRET });

    expect(current.verify(legacy.plaintext, legacy.hash)).toBe(false);
    expect(current.candidateHashes(legacy.plaintext)).toHaveLength(1);
  });

  it("缺少密钥时拒绝构造（不允许生成无法校验的 Key）", () => {
    expect(() => createApiKeyHasher({ secret: "" })).toThrow(
      /API_KEY_HMAC_SECRET_REQUIRED/u,
    );
  });
});
