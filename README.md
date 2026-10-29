# Meeting Room Booking

A single-room booking demo for the Mad Devs frontend assignment: browse a day, create meetings, move them, rename them, and delete them. The interface is in Russian.

- **Deployed demo:** [Open Meeting Room Booking](https://meeting-room-booking-alpha-jet.vercel.app/). No Vercel account is required.
- **Repository:** [OlegPeunov/meeting-room-booking](https://github.com/OlegPeunov/meeting-room-booking).
- **Actual time spent:** 4h.
- **AI conversation export:** https://chatgpt.com/s/cx_6ae2b5280a888191908c0f90d8c0c62c

These are the submission materials requested in the assignment. The repository is currently private; grant the reviewer access before submitting it.

## Stack

React, TypeScript (strict), Vite, plain CSS, and MSW. Tests use Vitest and React Testing Library with jsdom. React manages state; there is no backend or UI framework.

## Run locally

Use Node.js **24.21.0**, as specified in `.nvmrc`, and its bundled npm. With nvm installed:

```sh
git clone https://github.com/OlegPeunov/meeting-room-booking.git
cd meeting-room-booking
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

The clone command requires access to the private repository. Open the address printed by Vite (usually `http://localhost:5173`). Without nvm, install Node.js 24.21.0 before running the remaining commands.

This setup was verified from a clean copy using the committed lockfile and `.env.example`; existing `node_modules`, local environment files, and global project tools are not required.

The public `VITE_ENABLE_MOCKS=true` flag enables the demo API. `.env.local` is ignored by Git and applies to dev and production builds. No secrets or other local files are required. Restart Vite or rebuild after changing the flag. Setting it to `false` requires a real API.

## Checks and production preview

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run preview
```

Preview serves `dist`, usually at `http://localhost:4173`; rebuild after changes. Individual suites: `npm run test:domain`, `npm run test:api`, and `npm run test:ui`.

Tests cover time rules, editing restrictions, API statuses, persistence, CRUD, conflict recovery, stale responses, duplicate submissions, focus, and worker notification acknowledgements. Responsive layout and service workers also require browser checks.

## Architecture

- `src/bookings/domain`: React-independent types, local date/time helpers, and validation. Times are compared as minutes since midnight; validation receives the current time explicitly and returns error codes.
- `src/bookings/api`: fetch client and response/error contracts.
- `src/mocks`: MSW handlers and their own store. Each write revalidates against current data and time; UI validation is never trusted.
- `src/bookings/ui`: date navigation, vertical timeline, form, and request state. Components access data through the API client.

Date changes cancel obsolete loads; stale results are ignored. Failed saves preserve the draft. A 409 refreshes the schedule without resubmitting. Saving is blocked if that refresh fails.

## Product decisions

- Local browser dates and timezone; working hours **09:00–18:00**.
- A **30-minute selection step** keeps the timeline and editing simple. Duration is **30–120 minutes**, and start must precede end.
- Meetings cannot overlap; touching endpoints are allowed. Editing excludes the current booking from overlap checks.
- Creation in the past is blocked. Future meetings can move to another date or time.
- Once a meeting starts, including after it ends, its schedule is locked. Its optional title can still change, and deletion remains available with confirmation.
- On mobile, the form follows the schedule. Main actions support keyboard navigation.

## Mock API and storage

With the flag enabled, MSW starts **before React renders**, including in production. The committed `public/mockServiceWorker.js` is copied into `dist`; no generation step is needed after cloning. Browser startup acknowledges MSW 3.0.3’s service-worker notifications to avoid its [five-minute interception regression](https://github.com/mswjs/msw/issues/2801); the generated worker stays unchanged. Validate this workaround on a fresh origin when replacing an older build: already pending worker messages are not repaired retroactively.

| Request | Success |
| --- | --- |
| `GET /api/bookings?date=YYYY-MM-DD` | 200, bookings sorted by start time |
| `POST /api/bookings` | 201, created booking |
| `PATCH /api/bookings/:id` | 200, updated booking; partial changes accepted |
| `DELETE /api/bookings/:id` | 204 |

Errors: 404 for missing bookings, 409 for overlap, 422 for invalid requests/rules. Booking: `{ id, date, start, end, title? }`, with `YYYY-MM-DD` dates and `HH:mm` times.

Data uses `sessionStorage` key `meeting-room-booking:bookings:v1` and survives same-tab reloads. Tabs do not synchronize. New sessions seed meetings for tomorrow and the following day; persisted dates stay fixed. Unavailable storage falls back to memory without reliable reload persistence. Invalid stored data is reseeded.

To reset demo data, run this in the browser console on the app page, then reload. This replaces bookings in that tab:

```js
await fetch('/api/demo/reset', { method: 'POST' })
location.reload()
```

## Reproduce errors

The links below open the hosted demo. Append the same query parameters to the dev or preview URL to reproduce them locally:

- [`?scenario=conflict`](https://meeting-room-booking-alpha-jet.vercel.app/?scenario=conflict): the first valid POST to free future time creates a competing meeting and returns **409**. The refreshed timeline shows it while all draft fields remain. Choose another free interval and save manually.
- [`?scenario=load-error`](https://meeting-room-booking-alpha-jet.vercel.app/?scenario=load-error): the first valid schedule GET returns **503**. Use “Повторить загрузку” to retry.
- [`?scenario=save-error`](https://meeting-room-booking-alpha-jet.vercel.app/?scenario=save-error): the first valid POST or PATCH returns **503** without writing. Retry saving manually; the draft is preserved.

Scenarios run once per page load; reload/reset rearms them. Invalid or occupied writes do not consume the simulated save/conflict failure. Reload keeps bookings: choose a free interval.

## Scope and limitations

Implemented: date navigation, timeline, full CRUD, domain and server-side mock validation, loading/empty/error/submitting states, conflict recovery, responsive layout, and basic accessibility. All required application features are implemented; the remaining submission placeholders are listed at the top.

This browser-local demo has no authentication, shared backend, multiple rooms, or cross-tab synchronization. It needs JavaScript, service workers, and HTTPS when hosted (HTTP works on localhost/127.0.0.1). Browser E2E automation and full screen-reader/cross-browser audits are not included. Forced browser suspension/worker termination is not covered; reload if mocking stops.

With more time: connect a real backend, add browser E2E tests and broader accessibility checks, then improve multi-user synchronization if required.

## Deployment and verification

The demo is deployed on Vercel from the repository root with these settings:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `node --version && npm run build` |
| Output directory | `dist` |
| Node.js | 24.x (24.22.1 in the verified deployment) |
| Production environment | `VITE_ENABLE_MOCKS=true` |

The flag must be set before building: Vite embeds it in the client bundle. Ignored local environment files are not needed on Vercel. The production domain is public; `/mockServiceWorker.js` is served as JavaScript over HTTPS.

Verification completed before submission preparation:

- Clean-copy setup, all 173 tests, typecheck, lint, production build, and local preview.
- Public HTTPS access without authentication, MSW interception, CRUD, and persistence after reload.
- Conflict recovery with all draft fields preserved and a successful manual retry; load/save error retries.
- An open edit form left idle for more than eight minutes, followed by successful save, schedule refresh, delete, create, and reload checks.
- Layout at 320 and 390 px without horizontal scrolling, plus basic keyboard interaction.

These checks do not replace the broader browser and accessibility audits listed under limitations.
