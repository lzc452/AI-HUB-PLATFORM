import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPolicyError";
  }
}

export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    this.assertValidPassword(password);
    const salt = randomBytes(16).toString("base64url");
    const derived = (await scrypt(password, salt, keyLength)) as Buffer;
    return `scrypt:v1:${salt}:${derived.toString("base64url")}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [, version, salt, expected] = storedHash.split(":");
    if (version !== "v1" || salt === undefined || expected === undefined) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected, "base64url");
    const actualBuffer = (await scrypt(
      password,
      salt,
      expectedBuffer.length,
    )) as Buffer;
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  assertValidPassword(password: string): void {
    if (password.length < 8) {
      throw new PasswordPolicyError("PASSWORD_TOO_SHORT");
    }

    if (!/^[\x20-\x7e]+$/.test(password)) {
      throw new PasswordPolicyError("PASSWORD_MUST_BE_ASCII");
    }
  }
}
