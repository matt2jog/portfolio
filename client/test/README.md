Test helpers & how-to

- `utils/robustClickElement.ts` - a Playwright helper that scrolls and settles the target before issuing a native mouse.click at the computed viewport coordinates. It also probes the topmost node with `document.elementFromPoint` and can capture a screenshot if the click did not emit the expected events.

How to run (local dev):
- Start server and client dev servers (as you usually do). If ports conflict, stop the previous process or change port in your `.env`/config.
- Install Playwright if you haven't: `npx playwright install`
- Run tests: `npx playwright test client/test/e2e/project-card.spec.ts`

Notes:
- These tests assume `http://localhost:5000` is serving the app. Adjust the URL in the test if needed.
- The helper is intentionally conservative and returns diagnostics for CI flakiness troubleshooting.
