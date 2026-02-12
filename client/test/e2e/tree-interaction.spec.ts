// @ts-nocheck
import { test, expect } from '@playwright/test';

async function centerCardLabel(page) {
  return await page.evaluate(() => {
    const root = document.querySelector('[data-testid="niche-carousel"]');
    if (!root) return null;
    const anchors = Array.from(root.querySelectorAll('a')) as HTMLElement[];
    if (!anchors.length) return null;
    const measured = anchors.map(a => {
      const r = a.getBoundingClientRect();
      const area = Math.max(0, r.width) * Math.max(0, r.height);
      const title = a.querySelector('h3')?.textContent || '';
      return { area, title };
    });
    measured.sort((a,b) => b.area - a.area);
    return measured[0]?.title || null;
  });
}

test.describe('Tree carousel interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5001/tree');
    await page.waitForSelector('[data-testid="niche-carousel"]');
  });

  test('keyboard ArrowRight / ArrowLeft navigates center card', async ({ page }) => {
    const first = await centerCardLabel(page);
    expect(first).toBeTruthy();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const second = await centerCardLabel(page);
    expect(second).not.toEqual(first);

    // ensure focus follows the center card (resets any highlight)
    const focused = await page.evaluate(() => document.activeElement?.querySelector('h3')?.textContent || null);
    expect(focused).toEqual(second);

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    const back = await centerCardLabel(page);
    expect(back).toEqual(first);

    await page.screenshot({ path: 'test-results/tree-interaction-keyboard.png', fullPage: true });
  });

  test('pointer drag (swipe) changes center card', async ({ page }) => {
    const root = await page.$('[data-testid="niche-carousel"]');
    const box = await root!.boundingBox();
    expect(box).toBeTruthy();

    const before = await centerCardLabel(page);

    // drag left-to-right (previous)
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 200, box!.y + box!.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const afterPrev = await centerCardLabel(page);
    expect(afterPrev).not.toEqual(before);

    // drag right-to-left (next)
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 - 220, box!.y + box!.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const afterNext = await centerCardLabel(page);
    expect(afterNext).not.toEqual(afterPrev);

    await page.screenshot({ path: 'test-results/tree-interaction-drag.png', fullPage: true });
  });

  test('tap neighbor on mobile centers that card', async ({ page }) => {
    // emulate small viewport (mobile)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForSelector('[data-testid="niche-carousel"]');

    const before = await centerCardLabel(page);

    // find bounding boxes and click a visible neighbor (right side)
    const coords = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="niche-carousel"]')!;
      const anchors = Array.from(root.querySelectorAll('a')) as HTMLElement[];
      const measured = anchors.map((a, idx) => ({ idx, r: a.getBoundingClientRect() }));
      measured.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
      const center = measured[0].r;
      const neighbor = measured.find(m => m.r.left > center.left) || measured[1];
      return { x: Math.round(neighbor.r.left + neighbor.r.width / 2), y: Math.round(neighbor.r.top + neighbor.r.height / 2) };
    });

    await page.mouse.click(coords.x, coords.y);
    await page.waitForTimeout(300);

    const after = await centerCardLabel(page);
    expect(after).not.toEqual(before);

    await page.screenshot({ path: 'test-results/tree-interaction-tap-mobile.png', fullPage: true });
  });
});