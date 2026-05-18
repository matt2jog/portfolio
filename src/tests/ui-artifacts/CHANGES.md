# UI Artifacts Changes

Date: 2026-05-14

## What changed

- The GitHub Actions workflow now passes the four available runtime secrets into the artifact job:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- The workflow sets `E2E_DATA_MODE=hybrid`, which keeps volatile public API calls mocked but lets database-backed public endpoints load through the backend.
- The workflow validates those four env values before starting the screenshot run, so a missing secret fails early instead of producing misleading empty-data screenshots.
- The Playwright artifact config now starts the integrated Express + Vite app instead of Vite-only client dev server.
- The artifact suite is pinned to one worker to avoid parallel project runs contending with the same backend server and shared artifact folders.
- Long artifact views now write bounded paginated screenshot folders with a `manifest.json` instead of relying on a single viewport-height PNG.

## Paginated artifacts

The following artifact groups now capture multiple viewport slices when needed:

- `privacy-policy`
- `tracking-notice`
- `terms-of-use`
- `project-chat-page`
- `about/timeline`
- `activity/github`
- `activity/linkedin`
- `admin-dashboard/bio`
- `admin-dashboard/projects`
- `admin-dashboard/skills`

Each group is capped by both page count and scroll distance. This prevents unbounded capture on lazy-loaded views like the activity monitor while still showing enough generated content and formatting to review the page.

## Local verification

- Ran `npm run check` successfully after the changes.
- Confirmed Playwright test discovery sees 20 artifact tests across desktop and mobile.
- Local screenshot generation was attempted in hybrid mode. In this Windows/OneDrive shell, the Playwright command shim and server-owned process exited without stable reporter output, so I could not complete a full local artifact ingestion pass here.

## Notes

- No git commands were used.
- Admin dashboard endpoints remain mocked because authenticated admin data cannot be reached with only the four runtime env values and no browser auth session.
