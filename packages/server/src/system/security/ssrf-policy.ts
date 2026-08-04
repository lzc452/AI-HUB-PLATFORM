import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

interface ResolvedAddress {
  address: string;
  family: number;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "instance-data.ec2.internal",
]);

function ipv4Parts(address: string): number[] | undefined {
  if (isIP(address) !== 4) return undefined;
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => part >= 0 && part <= 255)
    ? parts
    : undefined;
}

export function isPrivateAddress(address: string): boolean {
  const ipv4 = ipv4Parts(address);
  if (ipv4 !== undefined) {
    const first = ipv4[0]!;
    const second = ipv4[1]!;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }

  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    isIP(normalized) === 6 &&
    (normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("::ffff:127."))
  );
}

export type ResolveHost = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ResolvedAddress[]>;

export async function assertPublicHttpTarget(
  rawUrl: string,
  resolveHost: ResolveHost = lookup,
): Promise<URL> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error("SSRF_URL_INVALID");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("SSRF_PROTOCOL_INVALID");
  }
  if (target.username !== "" || target.password !== "") {
    throw new Error("SSRF_CREDENTIALS_FORBIDDEN");
  }

  const hostname = target.hostname.toLowerCase().replace(/[.]$/, "");
  if (BLOCKED_HOSTNAMES.has(hostname) || isPrivateAddress(hostname)) {
    throw new Error("SSRF_PRIVATE_TARGET");
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolveHost(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("SSRF_DNS_FAILED");
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error("SSRF_PRIVATE_TARGET");
  }
  return target;
}
