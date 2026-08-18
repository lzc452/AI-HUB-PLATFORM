import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateMiniProgramQr } from "./qr-code-validator.js";

async function loadFixture(name: string): Promise<Buffer> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url));
}

describe("validateMiniProgramQr", () => {
  it("rejects non-image qr uploads", async () => {
    await expect(
      validateMiniProgramQr(Buffer.from("not an image"), "wechat"),
    ).rejects.toThrow("QR_DECODE_FAILED");
  });

  it("rejects qr content that is not a valid mini program target", async () => {
    const png = await loadFixture("not-a-miniapp-qr.png");
    await expect(validateMiniProgramQr(png, "wechat")).rejects.toThrow(
      "QR_TARGET_FORMAT_INVALID",
    );
  });

  it("rejects an unknown platform before reading the image", async () => {
    const png = await loadFixture("miniapp-qr-wechat.png");
    await expect(validateMiniProgramQr(png, "other")).rejects.toThrow(
      "QR_TARGET_FORMAT_INVALID",
    );
  });

  it("returns the target identifier for a valid wechat mini program qr", async () => {
    const png = await loadFixture("miniapp-qr-wechat.png");
    await expect(validateMiniProgramQr(png, "wechat")).resolves.toBe(
      "wxa://gh_abcdef1234567890",
    );
  });

  it("accepts https and dingtalk targets for dingtalk", async () => {
    const png = await loadFixture("miniapp-qr-dingtalk.png");
    await expect(validateMiniProgramQr(png, "dingtalk")).resolves.toBe(
      "dingtalk://dingtalkclient/action/sendmsg?dingtalk_id=abc123",
    );
  });
});
