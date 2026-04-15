// Copyright 2026 Mapped Inc.
// SPDX-License-Identifier: MIT
// See LICENSE at the repository root for full license text.

import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Standalone capture test — run with:
//   npx playwright test capture-demo-gif --project=chromium --reporter=list
// Produces a sequence of PNG frames in scripts/frames/ that ffmpeg can turn into a GIF.

test.setTimeout(240_000);

test("capture work-order demo GIF frames", async ({ page }) => {
  const framesDir = path.resolve("scripts/frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForTimeout(1500);

  // Screenshot the canvas element directly — its bounding box can change mid-sim
  // as `contentHeight` recomputes, so a static clip would drift. Using the locator
  // variant of `screenshot()` re-reads bounds every frame.
  const canvas = page.locator("canvas").first();

  await page
    .locator("button", { hasText: "PREDICTIVE" })
    .first()
    .click()
    .catch(() => {});
  // Lightning speed: 5m/s, so 10s real ≈ 50 sim min — enough for a full WO+janitor+cleanup cycle.
  await page
    .locator("button", { hasText: "Lightning" })
    .first()
    .click()
    .catch(() => {});
  await page.locator("button", { hasText: "SKIP TO ALL-HANDS" }).click();
  // Settle: let the post-all-hands predictive WO fully cycle (2-3 real sec at Lightning).
  await page.waitForTimeout(6_000);

  const countTickets = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll("span")).filter(
          (s) => s.textContent?.trim() === "WORK ORDER"
        ).length
    );

  const fps = 15;
  const frameInterval = Math.round(1000 / fps);
  const maxDurationMs = 90_000;
  const preEventFrames = fps * 2; // 30 = 2s
  const postEventFrames = fps * 8; // 120 = 8s

  const frames: Buffer[] = [];
  const ticketCounts: number[] = [];
  const start = Date.now();
  let eventFrameIndex: number | null = null;

  while (Date.now() - start < maxDurationMs) {
    const frameStart = Date.now();
    const buf = await canvas.screenshot({ type: "png" });
    frames.push(buf);
    const count = await countTickets();
    ticketCounts.push(count);

    // Detect a count INCREASE from the immediately-preceding frame — this is a new WO creation.
    // Only accept events that occur after we have enough pre-roll buffer.
    if (
      eventFrameIndex === null &&
      frames.length > preEventFrames &&
      ticketCounts.length >= 2 &&
      ticketCounts[ticketCounts.length - 1] > ticketCounts[ticketCounts.length - 2]
    ) {
      eventFrameIndex = frames.length - 1;
    }

    if (eventFrameIndex !== null && frames.length - eventFrameIndex >= postEventFrames) {
      break;
    }

    const elapsed = Date.now() - frameStart;
    if (elapsed < frameInterval) {
      await page.waitForTimeout(frameInterval - elapsed);
    }
  }

  if (eventFrameIndex === null) {
    throw new Error(
      `No qualifying work-order event observed. Ticket-count timeline: ${ticketCounts.join(",")}`
    );
  }

  const startIdx = eventFrameIndex - preEventFrames;
  const endIdx = Math.min(frames.length, eventFrameIndex + postEventFrames);
  const windowFrames = frames.slice(startIdx, endIdx);

  windowFrames.forEach((buf, i) => {
    const name = `frame_${i.toString().padStart(4, "0")}.png`;
    fs.writeFileSync(path.join(framesDir, name), buf);
  });

  console.log(
    `Captured ${windowFrames.length} frames; WO event at local index ${eventFrameIndex - startIdx} (of ${windowFrames.length}) -> ${framesDir}`
  );
});
