import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * API Key 的生成与摘要（PRD 10.1）。
 *
 * ## 为什么是 HMAC 而不是 bcrypt/scrypt
 *
 * Key 的校验路径是「按凭据查一行」而不是「拿到一行再比对口令」：网关需要 O(1) 定位，
 * 因此摘要必须**可索引**，这是 HMAC（带服务端密钥的 SHA-256）而非慢哈希的适用场景。
 * 明文本身是 190+ bit 随机串，不存在被字典/爆破的现实空间，慢哈希在这里只带来延迟。
 *
 * ## 双密钥过渡
 *
 * 服务端 HMAC 密钥轮换时，若只认新密钥，**存量 Key 会全部失效**。因此校验需要同时接受
 * 新密钥与上一版密钥（`previousSecret`）：先算新、再算旧，任一命中即通过。过渡期结束后
 * 移除旧密钥配置即可。
 */

const KEY_PREFIX = "sk-aihub-";
const PREFIX_DISPLAY_LENGTH = 16;
const TOKEN_LENGTH = 32;
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export interface ApiKeyHasherOptions {
  /** 当前 HMAC 密钥（>=32 字符由配置层保证）。 */
  secret: string;
  /** 过渡期旧密钥；提供时校验同时接受新旧两种摘要。 */
  previousSecret?: string | undefined;
}

export interface GeneratedApiKey {
  /** 完整明文，仅在创建/轮换响应中返回一次，绝不落库。 */
  plaintext: string;
  /** 展示用前缀（前 16 字符）。 */
  prefix: string;
  /** 当前密钥下的 HMAC-SHA256 hex 摘要。 */
  hash: string;
}

export interface ApiKeyHasher {
  generate(): GeneratedApiKey;
  /** 用当前密钥计算摘要。 */
  hash(plaintext: string): string;
  /**
   * 校验候选摘要（新密钥在前、旧密钥在后），供按哈希查库使用。
   * 返回值可用于 `where key_hash in (...)`。
   */
  candidateHashes(plaintext: string): readonly string[];
  /** 常量时间比较：明文对应的任一候选摘要是否等于存量摘要。 */
  verify(plaintext: string, storedHash: string): boolean;
}

/**
 * 无偏随机串：按字母表长度做拒绝采样，避免 `% 62` 带来的分布偏斜
 * （凭据类随机串不接受可度量的偏差）。
 */
function randomToken(length: number): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

function digest(secret: string, plaintext: string): string {
  return createHmac("sha256", secret).update(plaintext, "utf8").digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createApiKeyHasher(options: ApiKeyHasherOptions): ApiKeyHasher {
  const secrets = [options.secret, options.previousSecret].filter(
    (secret): secret is string => typeof secret === "string" && secret !== "",
  );
  if (secrets.length === 0) {
    throw new Error("API_KEY_HMAC_SECRET_REQUIRED");
  }
  const [primary] = secrets;

  return {
    generate(): GeneratedApiKey {
      const plaintext = `${KEY_PREFIX}${randomToken(TOKEN_LENGTH)}`;
      return {
        plaintext,
        prefix: plaintext.slice(0, PREFIX_DISPLAY_LENGTH),
        hash: digest(primary!, plaintext),
      };
    },
    hash(plaintext: string): string {
      return digest(primary!, plaintext);
    },
    candidateHashes(plaintext: string): readonly string[] {
      return [...new Set(secrets.map((secret) => digest(secret, plaintext)))];
    },
    verify(plaintext: string, storedHash: string): boolean {
      return secrets.some((secret) =>
        constantTimeEqual(digest(secret, plaintext), storedHash),
      );
    },
  };
}

/** 供测试与文档使用的 Key 形状断言（不含密钥，纯格式）。 */
export const API_KEY_FORMAT = Object.freeze({
  prefix: KEY_PREFIX,
  displayLength: PREFIX_DISPLAY_LENGTH,
  tokenLength: TOKEN_LENGTH,
});
