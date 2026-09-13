import dns from "node:dns/promises";
import http from "node:http";
import net from "node:net";
import ipaddr from "ipaddr.js";
export function normalizeUrl(input: string) {
  const url = new URL(input.includes("://") ? input : `https://${input}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use a public HTTP or HTTPS URL without credentials.");
  if (url.port) throw new Error("Only standard HTTP/HTTPS ports are allowed.");
  url.hash = "";
  return url.toString();
}
export function isPublicIp(address: string) {
  try {
    const ip = ipaddr.process(address);
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolvePublic(host: string) {
  host = host.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  )
    throw new Error("Local and private network destinations are blocked.");
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await lookupWithTimeout(host);
  if (!addresses.length || addresses.some((a) => !isPublicIp(a.address)))
    throw new Error(
      "Local, private, and reserved network destinations are blocked.",
    );
  return addresses[0];
}
async function lookupWithTimeout(host: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      dns.lookup(host, { all: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("DNS resolution timed out.")),
          8000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function validateUrl(input: string) {
  const url = normalizeUrl(input);
  await resolvePublic(new URL(url).hostname);
  return url;
}
// Resolve at connection time and pin the actual socket to the validated address.
// Every redirect and subresource traverses this proxy; DNS cannot change between check and connect.
export async function startProxy() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(normalizeUrl(req.url || ""));
      if (url.protocol !== "http:") throw new Error("Invalid proxy protocol");
      const address = await resolvePublic(url.hostname);
      const headers = { ...req.headers, host: url.host };
      delete headers["proxy-authorization"];
      const upstream = http.request(
        {
          host: address.address,
          port: 80,
          path: url.pathname + url.search,
          method: req.method,
          headers,
          timeout: 20000,
        },
        (r) => {
          res.writeHead(r.statusCode || 502, r.headers);
          r.pipe(res);
        },
      );
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end("UXBench blocked this network destination.");
    }
  });
  server.on("connect", async (req, client, head) => {
    try {
      const target = new URL(`https://${req.url}`);
      if (target.port && target.port !== "443") throw new Error("Port blocked");
      const address = await resolvePublic(target.hostname);
      const upstream = net.connect(443, address.address, () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.setTimeout(45000, () => upstream.destroy());
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  const sockets = new Set<net.Socket>();
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  server.requestTimeout = 25000;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as net.AddressInfo;
  return {
    port: address.port,
    close: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}
export function assertLocalMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new Error("Cross-origin requests are not allowed.");
    return;
  }
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new Error("Cross-origin requests are not allowed.");
  }
  const requestUrl = new URL(request.url);
  if (
    originUrl.origin !== requestUrl.origin &&
    !sameLoopbackOrigin(originUrl, requestUrl)
  )
    throw new Error("Cross-origin requests are not allowed.");
}

function sameLoopbackOrigin(a: URL, b: URL) {
  return (
    a.port === b.port &&
    isLoopbackHost(a.hostname) &&
    isLoopbackHost(b.hostname)
  );
}

function isLoopbackHost(host: string) {
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(
    host.toLowerCase(),
  );
}
