import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const url = 'http://localhost:5000';
  await page.goto(url, { waitUntil: 'networkidle' });

  // Enable hover sampler instrumentation in page
  await page.evaluate(() => { (window as any).__enableHoverSampler = true; window.__pageErrors = window.__pageErrors || []; });

  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Profiler.enable');
  await client.send('Profiler.start');
  await client.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-v8.cpu_profiler,disabled-by-default-devtools.timeline', options: 'sampling-frequency=10000', transferMode: 'ReturnAsStream' });

  // aggressive cycling: multiple passes across project cards
  const cards = await page.$$('.project-card');
  if (!cards || cards.length === 0) {
    console.error('no cards found');
    await browser.close();
    process.exit(1);
  }

  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < Math.min(cards.length, 6); i++) {
      const box = await cards[i].boundingBox();
      if (!box) continue;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx - 30, cy);
      await page.mouse.move(cx, cy);
      await page.waitForTimeout(30 + Math.floor(Math.random() * 35));
    }
  }

  await page.waitForTimeout(600);

  const tracePromise = new Promise(resolve => client.once('Tracing.tracingComplete', (e) => resolve(e.stream)));
  await client.send('Tracing.end');
  const stream = await tracePromise as any;
  let eof = false;
  let data = '';
  while (!eof) {
    const r = await client.send('IO.read', { handle: stream, size: 65536 });
    data += r.data || '';
    eof = r.eof;
  }
  await client.send('IO.close', { handle: stream });
  const profStop = await client.send('Profiler.stop');
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const sampler = await page.evaluate(() => ({ recalc: window.__recalcTimings ? window.__recalcTimings.slice(-200) : [], activation: window.__activationTimings ? window.__activationTimings.slice(-200) : [], hoverSampler: window.__hoverSamplerLogs ? window.__hoverSamplerLogs.slice(-200) : [], pageErrors: window.__pageErrors ? window.__pageErrors.slice(-200) : [] }));

  const out = { traceSize: data.length, profile: profStop.profile, sampler };
  const outJson = JSON.stringify(out, null, 2);
  fs.writeFileSync('attached_assets/hover-verify-result.json', outJson);
  console.log('Saved attached_assets/hover-verify-result.json');

  await browser.close();
})();
