// robustClickElement.ts
// Playwright-friendly helper to reliably perform native-like clicks on elements
// Usage: import { robustClickElement } from './utils/robustClickElement';
// Returns a diagnostic object { clicked: 'ok'|'forced', top, screenshotBase64?: string }

import type { Page, ElementHandle } from '@playwright/test';

export async function robustClickElement(page: Page, elHandle: ElementHandle<Element>, opts: { settleMs?: number, retry?: boolean, captureOnFail?: boolean } = {}) {
  const settleMs = opts.settleMs ?? 120;
  // ensure visible and settled
  await elHandle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(30);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.waitForTimeout(settleMs);

  const box = await elHandle.boundingBox();
  if (!box) throw new Error('Element has no bounding box');
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);

  const probe = await page.evaluate(({ x, y }) => {
    const n = document.elementFromPoint(x, y);
    return { nodeName: n ? n.nodeName : null, classList: n ? Array.from(n.classList || []) : [] };
  }, { x: cx, y: cy });

  // If the top node is not our card, try a short retry before forcing click
  let top = probe;
  if (!top.classList.includes('project-card')) {
    if (opts.retry) {
      await page.waitForTimeout(80);
      const probe2 = await page.evaluate(({ x, y }) => {
        const n = document.elementFromPoint(x, y);
        return { nodeName: n ? n.nodeName : null, classList: n ? Array.from(n.classList || []) : [] };
      }, { x: cx, y: cy });
      top = probe2;
    }
  }

  // perform native click at viewport coords
  await page.mouse.click(cx, cy, { button: 'left', delay: 10 });
  await page.waitForTimeout(80);

  // gather post-click diagnostics
  const logs = await page.evaluate(() => (window as any).__clickLogs || []);

  const result: any = { clicked: 'ok', top, logs };

  if (opts.captureOnFail && logs.length === 0) {
    try {
      const shot = await page.screenshot({ type: 'png' });
      result.screenshotBase64 = shot.toString('base64');
    } catch (e) {
      result.screenshotError = '' + e;
    }
  }

  return result;
}
