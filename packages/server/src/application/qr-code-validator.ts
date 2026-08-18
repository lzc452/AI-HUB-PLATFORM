import jsQRImport from "jsqr";
import { PNG } from "pngjs";

interface DecodedQr {
  data: string;
}

type JsQrDecode = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  providedOptions?: unknown,
) => DecodedQr | null;

/**
 * jsqr 1.4.0 以 UMD 发布：TypeScript（无 esModuleInterop）将默认导入解析为
 * 模块命名空间，而 Node ESM 的 CJS 互操作给出函数本身；两种环境下
 * `jsQR.default === jsQR`（bundle 内自引用）。统一归一化到可调用函数。
 */
const jsQR: JsQrDecode =
  (jsQRImport as unknown as { default?: JsQrDecode }).default ??
  (jsQRImport as unknown as JsQrDecode);

/**
 * 小程序平台二维码目标格式（规格 P1-11）：二维码内容必须命中平台前缀。
 * - 微信：`wxa://`（小程序 scheme）或 `https://`（网页跳转）
 * - 钉钉：`dingtalk://`（客户端 scheme）或 `https://`
 * - 支付宝：`alipays://`（客户端 scheme）或 `https://`
 * 大小写不敏感。
 */
const MINI_PROGRAM_TARGET_PATTERNS: Readonly<Record<string, RegExp>> = {
  wechat: /^(https:\/\/|weixin:\/\/).*|^wxa:/i,
  dingtalk: /^(https:\/\/|dingtalk:\/\/)/i,
  alipay: /^(https:\/\/|alipays:\/\/)/i,
};

export type MiniProgramPlatform = keyof typeof MINI_PROGRAM_TARGET_PATTERNS;

/**
 * 校验小程序渠道二维码资产：
 * 1. 解析 PNG（非图片或损坏的图片 → `QR_DECODE_FAILED`）；
 * 2. 解码二维码内容（无 QR / 无法解码 → `QR_DECODE_FAILED`）；
 * 3. 校验内容命中平台格式（未知平台或格式不符 → `QR_TARGET_FORMAT_INVALID`）。
 *
 * 返回解析出的目标标识（二维码原始内容）。
 */
export async function validateMiniProgramQr(
  buffer: Buffer,
  platform: string,
): Promise<string> {
  let png: PNG;
  try {
    png = PNG.sync.read(buffer);
  } catch {
    throw new Error("QR_DECODE_FAILED");
  }
  const { data, width, height } = png;
  const decoded = jsQR(new Uint8ClampedArray(data), width, height);
  if (decoded === null) {
    throw new Error("QR_DECODE_FAILED");
  }
  const content = decoded.data;
  const pattern = MINI_PROGRAM_TARGET_PATTERNS[platform];
  if (pattern === undefined || !pattern.test(content)) {
    throw new Error("QR_TARGET_FORMAT_INVALID");
  }
  return content;
}
