import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5000';

async function runTest() {
  let PROJECT_ID;
  try {
    const res = await fetch(`${BASE_URL}/api/public/projects`);
    const projects = await res.json();
    PROJECT_ID = projects[0]?.id;
    if (!PROJECT_ID) throw new Error("No projects found in DB to test with.");
  } catch(e) {
    console.error("Failed to fetch dynamically:", e.message);
    process.exit(1);
  }

  const URL = `${BASE_URL}/portfolio/${PROJECT_ID}/chat`;
  console.log(`Starting E2E test for ProjectChat at ${URL}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  try {
    const startTime = Date.now();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    
    // waiting a bit for react rendering
    await page.waitForTimeout(1000);
    
    // Check if Project chat actually loaded
    const unavailable = await page.getByText('Project chat unavailable').isVisible();
    if (unavailable) {
      throw new Error(`Project ${PROJECT_ID} is unavailable. Is the DB seeded properly?`);
    }

    console.log("Waiting for welcome message stream...");
    
    // Wait for at least one assistant message that's NOT a typing indicator
    // Typing indicator is a span containing 3 bouncing spans
    // Message content is typically inside ChatMarkdown
    const startWait = Date.now();
    
    // We expect the bot to stream a welcome message automatically.
    // Let's wait for a markdown block to appear, taking maximum 8 seconds.
    await page.waitForSelector('.min-w-0.break-normal', { timeout: 30000 }).catch(() => {
      throw new Error(`Welcome message did not start streaming within 30 seconds.`);
    });
    
    const welcomeTime = Date.now() - startWait;
    console.log(`[OK] Welcome message started streaming after ${welcomeTime}ms`);

    // Let's verify the message eventually finishes streaming
    // We can do this by waiting for the textarea to be enabled again
    console.log("Waiting for welcome completion...");
    await page.waitForFunction(() => {
      const ta = document.querySelector('textarea');
      return ta && !ta.disabled;
    }, { timeout: 15000 });
    
    console.log(`[OK] Welcome message completed.`);
    
    // Now test sending a message to assert the typing indicator
    console.log("Testing user prompt for typing indicator...");
    const textarea = page.getByPlaceholder(/Ask about this project/i);
    await textarea.focus();
    await textarea.pressSequentially("Hello, tell me more.", { delay: 50 });
    
    const sendButton = page.locator('button[title="Send message"]');
    await sendButton.waitFor({ state: 'visible', timeout: 5000 });
    
    // Explicitly wait until disabled is removed
    await page.waitForFunction(() => {
      const btn = document.querySelector('button[title="Send message"]');
      return btn && !btn.disabled;
    }, { timeout: 5000 });
    
    await sendButton.click();
    
    // IMMEDIATELY assert that the typing indicator is visible
    const indicator = page.locator('span.animate-bounce');
    try {
      await indicator.first().waitFor({ state: 'visible', timeout: 3000 });
      console.log("[OK] Typing indicator mounted immediately upon send.");
    } catch(e) {
      await page.screenshot({ path: 'scripts/e2e-failure.png' });
      throw new Error("Typing indicator did NOT mount immediately after message submission. Saved screenshot to scripts/e2e-failure.png");
    }

    console.log("Waiting for response to stream...");
    // Wait until the textarea is enabled again
    await page.waitForFunction(() => {
      const ta = document.querySelector('textarea');
      return ta && !ta.disabled;
    }, { timeout: 15000 });
    
    console.log("[OK] User message response completed.");
    
    console.log("TEST PASSED END-TO-END \u2728");
  } catch (error) {
    console.error("\n[FAILED] Test failed:", error.message);
  } finally {
    await browser.close();
  }
}

runTest().catch(console.error);
