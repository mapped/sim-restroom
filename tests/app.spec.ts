// Copyright 2026 Mapped Inc.
// SPDX-License-Identifier: MIT
// See LICENSE at the repository root for full license text.

import { test, expect } from "@playwright/test";

test.describe("Mapped Restroom Sim", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("REGISTRY")) {
        errors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForTimeout(1000);

    (page as any).__consoleErrors = errors;
  });

  test("page loads without errors", async ({ page }) => {
    const errors = (page as any).__consoleErrors as string[];
    expect(errors).toEqual([]);
  });

  test("time overlay is visible on canvas", async ({ page }) => {
    // Use the specific class to avoid matching event log timestamps
    await expect(
      page.locator(".text-3xl.font-mono").filter({ hasText: /\d+:\d+ [AP]M/ })
    ).toBeVisible();
  });

  test("canvas is rendered with content", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(600);
    expect(box!.height).toBeGreaterThan(600);
  });

  test("simulation controls are present", async ({ page }) => {
    await expect(page.locator("text=SIMULATION CONTROLS")).toBeVisible();
    await expect(page.locator("text=SIM SPEED")).toBeVisible();
    await expect(page.locator("text=SKIP TO ALL-HANDS")).toBeVisible();
  });

  test("all three speed buttons are visible", async ({ page }) => {
    await expect(page.locator("button", { hasText: "Real Time" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Fast" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Lightning" })).toBeVisible();
  });

  test("speed changes live without restart", async ({ page }) => {
    const lightningBtn = page.locator("button", { hasText: "Lightning" });
    await lightningBtn.click();
    // Speed label updates immediately — no restart needed
    await expect(page.locator("span", { hasText: "Lightning (5m/s)" })).toBeVisible();
  });

  test("cleaning mode toggle is present", async ({ page }) => {
    await expect(page.locator("text=CLEANING MODE")).toBeVisible();
    await expect(page.locator("button", { hasText: "PREDICTIVE" })).toBeVisible();
    await expect(page.locator("button", { hasText: "SCHEDULED (5 PM)" })).toBeVisible();
  });

  test("event log panel is present", async ({ page }) => {
    await expect(page.locator("text=EVENT LOG")).toBeVisible();
  });

  test("page background is white", async ({ page }) => {
    const bg = await page
      .locator(".min-h-screen")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
  });

  test("full page screenshot", async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot("full-page.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.3,
    });
  });
});
