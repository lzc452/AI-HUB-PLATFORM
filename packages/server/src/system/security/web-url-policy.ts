import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 内网 Web 交付 URL 白名单（规格 §11.3）。
 *
 * 与 `assertPublicHttpTarget`（拒绝私网目标的公网校验）相反，本策略面向
 * **内网**目标：仅当协议、端口、主机名与 DNS 解析地址全部命中白名单时放行。
 * 违规抛出的错误码：
 * - `WEB_URL_INVALID` / `WEB_URL_CREDENTIALS_FORBIDDEN`
 * - `WEB_URL_PROTOCOL_NOT_ALLOWED` / `WEB_URL_PORT_NOT_ALLOWED`
 * - `WEB_URL_HOST_NOT_ALLOWED`
 * - `WEB_URL_DNS_FAILED` / `WEB_URL_CIDR_NOT_ALLOWED`
 */
export interface WebTargetPolicy {
  protocols: string[];
  allowedHostnames: string[];
  allowedPorts: number[];
  allowedCidrs: string[];
}

export type ResolveHost = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

/** 拒绝一切 Web 目标（fail-closed）：装配点未显式提供策略时的安全默认。 */
export const DENY_ALL_WEB_TARGETS: WebTargetPolicy = {
  protocols: [],
  allowedHostnames: [],
  allowedPorts: [],
  allowedCidrs: [],
};

/** 宽松策略（任意主机与 IPv4 网段）：仅供单元/集成测试与本地开发装配。 */
export const PERMISSIVE_WEB_TARGET_POLICY: WebTargetPolicy = {
  protocols: ["http", "https"],
  allowedHostnames: ["*"],
  allowedPorts: [80, 443],
  allowedCidrs: ["0.0.0.0/0"],
};

function ipInCidrs(address: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => {
    const [network, prefixText] = cidr.split("/");
    const prefix = Number(prefixText);
    if (Number.isNaN(prefix) || network === undefined) return false;
    const ip = addressToInt(address);
    const net = addressToInt(network);
    if (ip === null || net === null) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ip & mask) === (net & mask);
  });
}

function addressToInt(address: string): number | null {
  if (isIP(address) !== 4) return null;
  return (
    address.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
  );
}

/**
 * 校验 Web 交付入口 URL 是否命中内网白名单，返回规范化后的 URL。
 *
 * 主机名匹配支持：精确名、`.corp.example.com` 后缀通配、`*` 全通配（宽松
 * 测试/本地策略）；IP 字面量直接进入 CIDR 校验（DNS 解析结果即字面量本身），
 * 无需出现在主机名白名单中——allowedCidrs 已显式限定允许网段。
 * CIDR 校验为纯 IPv4；解析出 IPv6 地址一律拒绝（fail-closed）。
 */
export async function validateWebTargetUrl(
  rawUrl: string,
  policy: WebTargetPolicy,
  resolveHost: ResolveHost = lookup,
): Promise<URL> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error("WEB_URL_INVALID");
  }
  if (target.username !== "" || target.password !== "") {
    throw new Error("WEB_URL_CREDENTIALS_FORBIDDEN");
  }
  if (!policy.protocols.includes(target.protocol.slice(0, -1))) {
    throw new Error("WEB_URL_PROTOCOL_NOT_ALLOWED");
  }
  const port =
    target.port === ""
      ? target.protocol === "https:"
        ? 443
        : 80
      : Number(target.port);
  if (!policy.allowedPorts.includes(port)) {
    throw new Error("WEB_URL_PORT_NOT_ALLOWED");
  }
  const hostname = target.hostname.toLowerCase().replace(/[.]$/, "");
  if (isIP(hostname) === 0) {
    const allowed = policy.allowedHostnames.some(
      (entry) =>
        entry === "*" ||
        hostname === entry ||
        (entry.startsWith(".") && hostname.endsWith(entry)),
    );
    if (!allowed) {
      throw new Error("WEB_URL_HOST_NOT_ALLOWED");
    }
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolveHost(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("WEB_URL_DNS_FAILED");
  }
  if (
    addresses.length === 0 ||
    !addresses.every(({ address }) => ipInCidrs(address, policy.allowedCidrs))
  ) {
    throw new Error("WEB_URL_CIDR_NOT_ALLOWED");
  }
  return target;
}
