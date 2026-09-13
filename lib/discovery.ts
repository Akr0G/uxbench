import { chromium } from "playwright";
import { normalizeUrl, startProxy, validateUrl } from "./security";
export function pageRole(url: string) {
  const path = new URL(url).pathname;
  if (path === "/") return "Homepage";
  if (/contact|register|login|signup/.test(path)) return "Contact / form";
  if (/about|info/.test(path)) return "About / information";
  if (/schedule|events|products|blog\/?$/.test(path))
    return "Listing / schedule";
  return "Detail / content";
}
export function samplePages(origin: string, links: string[], max = 5) {
  const seen = new Set<string>();
  for (const link of [origin, ...links]) {
    try {
      const url = normalizeUrl(new URL(link, origin).href);
      if (
        new URL(url).origin !== new URL(origin).origin ||
        /\.(pdf|png|jpg|zip|xml|mp4)$/i.test(new URL(url).pathname) ||
        /logout|delete|remove|signout/i.test(url)
      )
        continue;
      seen.add(url);
    } catch {
      /* Not a navigable public URL. */
    }
  }
  const all = [...seen];
  const picked = all.slice(0, 1);
  const roles = new Set(picked.map(pageRole));
  for (const url of all) {
    if (!roles.has(pageRole(url)) && picked.length < max) {
      picked.push(url);
      roles.add(pageRole(url));
    }
  }
  for (const url of all) {
    if (!picked.includes(url) && picked.length < max) picked.push(url);
  }
  return picked;
}
export async function discover(input: string) {
  const url = await validateUrl(input);
  const proxy = await startProxy();
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "<-loopback>" },
    args: [
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    if (!response || response.status() >= 400)
      throw new Error(
        `Page returned HTTP ${response?.status() ?? "no response"}`,
      );
    await validateUrl(page.url());
    const links = await page
      .locator("nav a[href],header a[href],a[href]")
      .evaluateAll((els) =>
        els.slice(0, 100).map((e) => (e as HTMLAnchorElement).href),
      );
    let sitemap: string[] = [];
    try {
      await page.goto(new URL("/sitemap.xml", url).href, {
        timeout: 10000,
        waitUntil: "domcontentloaded",
      });
      const content = await page.content();
      sitemap = [...content.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .slice(0, 100)
        .map((m) => m[1]);
    } catch {
      /* Sitemap is optional. */
    }
    return samplePages(url, [...links, ...sitemap]);
  } finally {
    await browser.close();
    proxy.close();
  }
}
