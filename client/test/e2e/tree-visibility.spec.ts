// @ts-nocheck
import { test, expect } from '@playwright/test';

test('tree page shows niche carousel cards', async ({ page }) => {
  await page.goto('http://localhost:5000/tree');
  await page.waitForSelector('[data-testid="niche-carousel"]', { timeout: 5000 });

  // count anchor cards inside the carousel
  const cardCount = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="niche-carousel"]');
    if (!root) return 0;
    return root.querySelectorAll('a').length;
  });

  // assert at least 3 cards exist and neighboring cards are partially visible
  expect(cardCount).toBeGreaterThanOrEqual(3);

  // verify at least 3 anchors have a non-zero boundingClientRect (partially visible)
  const visibleCards = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="niche-carousel"]');
    if (!root) return 0;
    const anchors = Array.from(root.querySelectorAll('a'));
    return anchors.filter(a => {
      const r = a.getBoundingClientRect();
      return r.width > 8 && r.height > 8 && (r.right > 0 && r.left < window.innerWidth);
    }).length;
  });

  // capture screenshot for debugging
  await page.screenshot({ path: 'test-results/tree-carousel.png', fullPage: true });

  expect(visibleCards).toBeGreaterThanOrEqual(3);
});