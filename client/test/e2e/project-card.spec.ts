// project-card.spec.ts
// Basic Playwright example that uses the robust click helper to click project cards across faces.

import { test, expect } from '@playwright/test';
import { robustClickElement } from '../utils/robustClickElement';

test('native click activates project card on each face', async ({ page }) => {
  await page.goto('http://localhost:5000');
  await page.waitForSelector('.project-cube');

  // prepare to collect click events
  await page.evaluate(() => {
    (window as any).__clickLogs = [];
    window.addEventListener('terminal-log', (e: any) => (window as any).__clickLogs.push(e.detail));
  });

  const navButtons = await page.$$('section#projects .flex.gap-4 button');
  const nextBtn = navButtons[1] || null;

  for (let face = 0; face < 4; face++) {
    await page.waitForTimeout(200);
    const active = await page.$('.project-card:not(.project-card--inactive)');
    expect(active, 'active card found').toBeTruthy();

    const res = await robustClickElement(page, active!, { settleMs: 120, retry: true, captureOnFail: true });
    // confirm the click handler fired
    const logs = await page.evaluate(() => (window as any).__clickLogs || []);
    expect(logs.length, `face ${face} click logged`).toBeGreaterThan(0);

    // navigate to next face if control present
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(300);
    }
  }
});
