import { createServer } from "node:http";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

import { defaultPinnedRequest, isBlockedIp, safeFetch, type DnsLookup, type PinnedRequest } from "@/server/import/ssrf";

const blocked = [
  "0.0.0.0",
  "10.1.2.3",
  "10.255.255.255",
  "100.64.0.1",
  "127.0.0.1",
  "127.0.0.2",
  "169.254.169.254",
  "169.254.1.1",
  "172.16.0.1",
  "172.31.255.255",
  "192.0.0.1",
  "192.0.2.1",
  "192.168.1.1",
  "198.18.0.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "240.0.0.1",
  "255.255.255.255",
  "::",
  "::1",
  "fc00::1",
  "fd12::1",
  "fe80::1",
  "ff02::1",
  "2001:db8::1",
  "64:ff9b::8.8.8.8",
  "::ffff:127.0.0.1",
  "::ffff:169.254.169.254",
  "::ffff:7f00:1",
];

const allowed = ["8.8.8.8", "1.1.1.1", "9.9.9.9", "172.15.255.255", "172.32.0.1", "100.128.0.1", "192.0.1.1", "2001:4860:4860::8888", "::ffff:8.8.8.8"];

describe("address policy", () => {
  it.each(blocked)("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(allowed)("allows %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

function lookup(map: Record<string, { address: string; family: 4 | 6 }[]>): DnsLookup {
  return async (hostname) => {
    if (!map[hostname]) throw new Error(`unexpected lookup ${hostname}`);
    return map[hostname];
  };
}

describe("safeFetch", () => {
  it("refuses private literals before any request", async () => {
    const request: PinnedRequest = async () => {
      throw new Error("request should not run");
    };
    await expect(safeFetch("http://127.0.0.1/recipe", { request })).rejects.toMatchObject({ code: "private_address" });
    await expect(safeFetch("http://169.254.169.254/latest/meta-data", { request })).rejects.toMatchObject({ code: "private_address" });
    await expect(safeFetch("http://[::1]/", { request })).rejects.toMatchObject({ code: "private_address" });
  });

  it("refuses local names and credentials without DNS", async () => {
    const lookupFn: DnsLookup = async () => {
      throw new Error("dns should not run");
    };
    await expect(safeFetch("http://localhost/recipe", { lookup: lookupFn })).rejects.toMatchObject({ code: "private_address" });
    await expect(safeFetch("http://metadata.google.internal/", { lookup: lookupFn })).rejects.toMatchObject({ code: "private_address" });
    await expect(safeFetch("http://user:pass@8.8.8.8/", { lookup: lookupFn })).rejects.toMatchObject({ code: "bad_url" });
    await expect(safeFetch("file:///etc/passwd", { lookup: lookupFn })).rejects.toMatchObject({ code: "bad_url" });
  });

  it("refuses a public name that also resolves to a private address", async () => {
    const request: PinnedRequest = async () => {
      throw new Error("request should not run");
    };
    await expect(
      safeFetch("http://example.test/recipe", {
        request,
        lookup: lookup({ "example.test": [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }] }),
      }),
    ).rejects.toMatchObject({ code: "private_address" });
  });

  it("does not follow a redirect into metadata", async () => {
    const calls: string[] = [];
    const request: PinnedRequest = async ({ url }) => {
      calls.push(url.hostname);
      return {
        status: 302,
        headers: { get: (name) => (name === "location" ? "http://169.254.169.254/latest" : "text/html") },
        body: Buffer.from(""),
      };
    };
    await expect(
      safeFetch("http://recipes.example/page", {
        request,
        lookup: lookup({ "recipes.example": [{ address: "8.8.8.8", family: 4 }] }),
      }),
    ).rejects.toMatchObject({ code: "private_address" });
    expect(calls).toEqual(["recipes.example"]);
  });

  it("pins the checked address and stops after too many redirects", async () => {
    let hops = 0;
    const request: PinnedRequest = async () => {
      hops += 1;
      return { status: 302, headers: { get: () => "http://recipes.example/next" }, body: Buffer.from("") };
    };
    await expect(
      safeFetch("http://recipes.example/start", {
        request,
        lookup: lookup({ "recipes.example": [{ address: "1.1.1.1", family: 4 }] }),
      }),
    ).rejects.toMatchObject({ code: "redirect_loop" });
    expect(hops).toBeLessThanOrEqual(4);
  });

  it("returns a public html body", async () => {
    const request: PinnedRequest = async ({ address }) => {
      expect(address).toBe("1.1.1.1");
      return { status: 200, headers: { get: () => "text/html; charset=utf-8" }, body: Buffer.from("<html></html>") };
    };
    const result = await safeFetch("https://recipes.example/a", {
      request,
      lookup: lookup({ "recipes.example": [{ address: "1.1.1.1", family: 4 }] }),
    });
    expect(result.finalUrl).toBe("https://recipes.example/a");
    expect(result.body.toString()).toContain("html");
  });
});

describe("pinned request limits", () => {
  it("aborts an oversized body and a stalled server", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("x".repeat(5000));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const url = new URL(`http://127.0.0.1:${address.port}/big`);
    await expect(
      defaultPinnedRequest({
        url,
        address: "127.0.0.1",
        headers: {},
        timeoutMs: 1000,
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: "response_too_large" });
    server.close();

    const stalled = createServer(() => undefined);
    stalled.listen(0, "127.0.0.1");
    await once(stalled, "listening");
    const stalledAddress = stalled.address();
    if (!stalledAddress || typeof stalledAddress === "string") throw new Error("no port");
    await expect(
      defaultPinnedRequest({
        url: new URL(`http://127.0.0.1:${stalledAddress.port}/slow`),
        address: "127.0.0.1",
        headers: {},
        timeoutMs: 200,
        maxBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
    stalled.close();
  });
});
