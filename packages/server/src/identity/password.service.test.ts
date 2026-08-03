import { describe, expect, it } from "vitest";
import { PasswordPolicyError, PasswordService } from "./password.service.js";

describe("PasswordService", () => {
  it("hashes and verifies an ASCII password", async () => {
    const service = new PasswordService();
    const hash = await service.hashPassword("Correct-123");

    expect(hash).toMatch(/^scrypt:v1:/);
    await expect(service.verifyPassword("Correct-123", hash)).resolves.toBe(
      true,
    );
    await expect(service.verifyPassword("wrong-pass", hash)).resolves.toBe(
      false,
    );
  });

  it("rejects short or non-ASCII passwords", async () => {
    const service = new PasswordService();

    await expect(service.hashPassword("short")).rejects.toThrow(
      PasswordPolicyError,
    );
    await expect(service.hashPassword("密码-123456")).rejects.toThrow(
      /PASSWORD_MUST_BE_ASCII/,
    );
  });
});
