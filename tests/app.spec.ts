import { test, expect } from '@playwright/test';

test.describe('Mapped Restroom Sim', () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('REGISTRY')) {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.waitForTimeout(1000);

    (page as any).__consoleErrors = errors;
  });

  test('page loads without errors', async ({ page }) => {
    const errors = (page as any).__consoleErrors as string[];
    expect(errors).toEqual([]);
  });

  test('time and day overlay is visible on canvas', async ({ page }) => {
    // Time display should show AM or PM
    await expect(page.locator('text=/\\d+:\\d+ [AP]M/')).toBeVisible();
    await expect(page.locator('text=/DAY \\d+/')).toBeVisible();
  });

  test('canvas is rendered at correct dimensions', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(600);
    expect(box!.height).toBeGreaterThan(600);
  });

  test('canvas has non-empty content', async ({ page }) => {
    const nonEmptyPixels = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return 0;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      const y = Math.floor(canvas.height / 2);
      const strip = ctx.getImageData(0, y, canvas.width, 1).data;
      let count = 0;
      for (let i = 3; i < strip.length; i += 4) {
        if (strip[i] > 0) count++;
      }
      return count;
    });
    expect(nonEmptyPixels).toBeGreaterThan(50);
  });

  test('simulation controls are present', async ({ page }) => {
    await expect(page.locator('text=SIMULATION SETTINGS')).toBeVisible();
    await expect(page.locator('text=POPULATION')).toBeVisible();
    await expect(page.locator('text=SIM SPEED')).toBeVisible();
    await expect(page.locator('text=SAVE & RESTART')).toBeVisible();
    await expect(page.locator('text=SKIP TO ALL-HANDS')).toBeVisible();
  });

  test('event log panel is present', async ({ page }) => {
    await expect(page.locator('text=RESTROOM EVENT LOG')).toBeVisible();
  });

  test('speed buttons work', async ({ page }) => {
    const lightningBtn = page.locator('button', { hasText: 'Lightning' });
    await lightningBtn.click();
    await expect(page.locator('text=UNSAVED CHANGES')).toBeVisible();
  });

  test('Meeting Room B is fully visible (not clipped)', async ({ page }) => {
    // The canvas height is computed from projected room bounds.
    // Verify the canvas attribute height matches CSS height (no clipping).
    const dims = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      return { attr: c.height, css: c.getBoundingClientRect().height };
    });
    expect(dims).not.toBeNull();
    // Canvas resolution should match displayed size (no clipping)
    expect(Math.abs(dims!.attr - dims!.css)).toBeLessThan(2);
    expect(dims!.attr).toBeGreaterThan(600);
  });

  test('no border on canvas container', async ({ page }) => {
    const container = page.locator('canvas').locator('..');
    const border = await container.evaluate(el => getComputedStyle(el).borderWidth);
    expect(border).toBe('0px');
  });

  test('page background is white', async ({ page }) => {
    const bg = await page.locator('.min-h-screen').first().evaluate(
      el => getComputedStyle(el).backgroundColor
    );
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  test('canvas starts near top of page (no large header)', async ({ page }) => {
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    // Canvas should start within 20px of the top of the page
    expect(box!.y).toBeLessThan(20);
  });

  test('full page screenshot', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('full-page.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.3,
    });
  });
});
