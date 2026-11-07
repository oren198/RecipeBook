import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

import { HttpError } from "@/domain/http";

const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 12_000;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.google",
  "instance-data",
]);

const v4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  v4.addSubnet(address, prefix, "ipv4");
}

const v6 = new BlockList();
v6.addAddress("::", "ipv6");
v6.addAddress("::1", "ipv6");
v6.addSubnet("fc00::", 7, "ipv6");
v6.addSubnet("fe80::", 10, "ipv6");
v6.addSubnet("fec0::", 10, "ipv6");
v6.addSubnet("ff00::", 8, "ipv6");
v6.addSubnet("2001:db8::", 32, "ipv6");
v6.addSubnet("2001:10::", 28, "ipv6");
v6.addSubnet("64:ff9b::", 96, "ipv6");
v6.addSubnet("2002::", 16, "ipv6");
v6.addSubnet("100::", 64, "ipv6");

export class ImportFetchError extends HttpError {
  constructor(code: string, message: string) {
    super(400, code, message);
  }
}

export function isBlockedIp(input: string): boolean {
  const unwrapped = unwrapIp(input);
  if (!unwrapped) return true;
  if (unwrapped.family === 4) return v4.check(unwrapped.ip, "ipv4");
  return v6.check(unwrapped.ip, "ipv6");
}

function unwrapIp(input: string): { ip: string; family: 4 | 6 } | null {
  const value = input.trim().toLowerCase();
  const dotted = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted?.[1] && isIP(dotted[1]) === 4) return { ip: dotted[1], family: 4 };
  const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex?.[1] && hex[2]) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    if (Number.isFinite(high) && Number.isFinite(low)) {
      const ip = `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
      return { ip, family: 4 };
    }
  }
  const family = isIP(value);
  if (family === 4) return { ip: value, family: 4 };
  if (family === 6) return { ip: value, family: 6 };
  return null;
}

function bareHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
}

export function blockedHostnameReason(hostname: string): string | null {
  const host = bareHostname(hostname);
  if (!host || host.includes("%") || host.includes(" ")) return "hostname_blocked";
  if (BLOCKED_HOSTS.has(host)) return "hostname_blocked";
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localdomain")) {
    return "hostname_blocked";
  }
  const ip = unwrapIp(host);
  if (ip && isBlockedIp(ip.ip)) return "private_address";
  return null;
}

export type ResolvedAddress = { address: string; family: 4 | 6 };

export type DnsLookup = (hostname: string) => Promise<ResolvedAddress[]>;

export type PinnedResponse = {
  status: number;
  headers: { get(name: string): string | null };
  body: Buffer;
};

export type PinnedRequest = (input: {
  url: URL;
  address: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}) => Promise<PinnedResponse>;

const defaultLookup: DnsLookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
};

function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address) === 6 ? 6 : 4;
  return ((hostname, options, callback) => {
    const done = typeof options === "function" ? options : callback;
    if (!done) return;
    done(null, address, family);
  }) as LookupFunction;
}

export const defaultPinnedRequest: PinnedRequest = (input) =>
  new Promise((resolve, reject) => {
    const lib = input.url.protocol === "https:" ? httpsRequest : httpRequest;
    const bareHost = input.url.hostname.replace(/^\[|\]$/g, "");
    const hostHeader = bareHost.includes(":")
      ? `[${bareHost}]${input.url.port ? `:${input.url.port}` : ""}`
      : input.url.host;
    const headers = { ...input.headers, host: hostHeader };
    const req = lib(
      {
        protocol: input.url.protocol,
        hostname: bareHost,
        port: input.url.port || (input.url.protocol === "https:" ? 443 : 80),
        path: `${input.url.pathname}${input.url.search}`,
        method: "GET",
        headers,
        lookup: pinnedLookup(input.address),
        servername: input.url.hostname,
        timeout: input.timeoutMs,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let failed = false;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > input.maxBytes) {
            failed = true;
            req.destroy();
            reject(new ImportFetchError("response_too_large", "העמוד גדול מדי לייבוא."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (failed) return;
          const rawHeaders = res.headers;
          resolve({
            status: res.statusCode ?? 0,
            headers: {
              get(name: string) {
                const value = rawHeaders[name.toLowerCase()];
                if (Array.isArray(value)) return value[0] ?? null;
                return value ?? null;
              },
            },
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", (error) => {
          if (!failed) reject(error);
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new ImportFetchError("timeout", "האתר לא הגיב בזמן."));
    });
    req.on("error", (error) => {
      if ((error as { code?: string }).code === "ERR_STREAM_DESTROYED") return;
      reject(error);
    });
    req.end();
  });

function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportFetchError("bad_url", "הכתובת אינה תקינה.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ImportFetchError("bad_url", "אפשר לייבא רק כתובות http או https.");
  }
  if (url.username || url.password) {
    throw new ImportFetchError("bad_url", "הכתובת לא יכולה לכלול שם משתמש או סיסמה.");
  }
  if (raw.length > 2000) {
    throw new ImportFetchError("bad_url", "הכתובת ארוכה מדי.");
  }
  const reason = blockedHostnameReason(url.hostname);
  if (reason === "private_address" || reason === "hostname_blocked") {
    throw new ImportFetchError("private_address", "הכתובת חסומה כי היא מצביעה לרשת פנימית.");
  }
  return url;
}

async function resolvePublicAddress(url: URL, lookup: DnsLookup): Promise<string> {
  const host = bareHostname(url.hostname);
  const literal = unwrapIp(host);
  if (literal) {
    if (isBlockedIp(literal.ip)) {
      throw new ImportFetchError("private_address", "הכתובת חסומה כי היא מצביעה לרשת פנימית.");
    }
    return literal.ip;
  }
  let records: ResolvedAddress[];
  try {
    records = await lookup(host);
  } catch {
    throw new ImportFetchError("dns_failed", "לא הצלחנו לזהות את כתובת האתר.");
  }
  if (records.length === 0) {
    throw new ImportFetchError("dns_failed", "לא הצלחנו לזהות את כתובת האתר.");
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new ImportFetchError("private_address", "הכתובת חסומה כי היא מצביעה לרשת פנימית.");
    }
  }
  const chosen = unwrapIp(records[0]?.address ?? "");
  if (!chosen || isBlockedIp(chosen.ip)) {
    throw new ImportFetchError("private_address", "הכתובת חסומה כי היא מצביעה לרשת פנימית.");
  }
  return chosen.ip;
}

function allowedContentType(value: string | null): boolean {
  if (!value) return true;
  const type = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return (
    type === "text/html" ||
    type === "application/xhtml+xml" ||
    type === "text/plain" ||
    type === "application/json" ||
    type === "application/ld+json"
  );
}

export async function safeFetch(
  rawUrl: string,
  deps: { lookup?: DnsLookup; request?: PinnedRequest } = {},
): Promise<{ finalUrl: string; body: Buffer; contentType: string | null }> {
  const lookup = deps.lookup ?? defaultLookup;
  const request = deps.request ?? defaultPinnedRequest;
  let current = assertPublicUrl(rawUrl);
  const seen = new Set<string>();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const key = current.href;
    if (seen.has(key)) {
      throw new ImportFetchError("redirect_loop", "האתר נכנס ללולאת הפניות.");
    }
    seen.add(key);
    const address = await resolvePublicAddress(current, lookup);
    const response = await request({
      url: current,
      address,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      headers: {
        accept: "text/html,application/xhtml+xml,application/json;q=0.8",
        "accept-language": "he,en;q=0.8",
        "user-agent": "FamilyRecipesImporter/1.0",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new ImportFetchError("bad_redirect", "ההפניה מהאתר אינה תקינה.");
      if (redirect === MAX_REDIRECTS) {
        throw new ImportFetchError("too_many_redirects", "יותר מדי הפניות באתר.");
      }
      current = assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ImportFetchError("fetch_failed", "לא הצלחנו לקרוא את העמוד.");
    }
    const contentType = response.headers.get("content-type");
    if (!allowedContentType(contentType)) {
      throw new ImportFetchError("unsupported_type", "העמוד אינו דף מתכון שאפשר לקרוא.");
    }
    if (response.body.length > MAX_HTML_BYTES) {
      throw new ImportFetchError("response_too_large", "העמוד גדול מדי לייבוא.");
    }
    return { finalUrl: current.toString(), body: response.body, contentType };
  }
  throw new ImportFetchError("too_many_redirects", "יותר מדי הפניות באתר.");
}

export function decodeFetchedBody(body: Buffer, contentType: string | null): string {
  const charset = /charset=([^;]+)/i.exec(contentType ?? "")?.[1]?.trim().toLowerCase().replaceAll('"', "");
  if (charset === "windows-1255" || charset === "iso-8859-8") {
    return new TextDecoder(charset).decode(body);
  }
  return body.toString("utf8");
}
