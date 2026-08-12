import type {
  MalwareScannerPort,
  SignatureVerifierPort,
} from "./storage.port.js";

/**
 * V1 占位实现：ClamAV 扫描与签名校验为外部演进项。
 * 生产安全不因缺少 ClamAV/签名服务而阻塞，后续接入真实实现时替换本组件即可。
 */
export class NoopMalwareScanner implements MalwareScannerPort {
  async scan(): Promise<"clean" | "infected"> {
    return "clean";
  }
}

export class NoopSignatureVerifier implements SignatureVerifierPort {
  async verify(): Promise<boolean> {
    return true;
  }
}

export function createNoopSecurity(): MalwareScannerPort &
  SignatureVerifierPort {
  return {
    scan: () => Promise.resolve("clean"),
    verify: () => Promise.resolve(true),
  };
}
