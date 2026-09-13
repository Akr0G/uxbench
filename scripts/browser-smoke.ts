import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = "http://localhost:3000";
await mkdir("data/verification", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page
    .getByRole("heading", {
      name: "Understand your website in a few clear scores.",
    })
    .waitFor();
  await page.screenshot({
    path: "data/verification/simple-home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Compare two websites" }).click();
  assert.equal(await page.getByLabel("Website to compare").count(), 1);
  await page.getByRole("tab", { name: "Grade one website" }).click();
  assert.equal(await page.getByLabel("Website to compare").count(), 0);
  await page.getByLabel("Your website URL").fill("http://localhost");
  await page.getByRole("button", { name: "Grade website" }).click();
  await page.locator(".simple-error").waitFor();
  assert.match(
    await page.locator(".simple-error").innerText(),
    /Local and private network destinations are blocked/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.waitForTimeout(400);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Simple app must reflow at 390px",
  );
  await page.screenshot({
    path: "data/verification/simple-home-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: two-flow UI, local-origin request handling, error state, and mobile reflow.",
  );
} finally {
  await browser.close();
}
