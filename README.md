# Meeting Room Booking

A single-room booking demo for the Mad Devs frontend assignment: browse a day, create meetings, move them, rename them, and delete them. The interface is in Russian.

- **Deployed demo:** TODO: add the published demo URL.
- **Actual time spent:** TODO: enter the actual development time.
- **AI conversation:** TODO: add the conversation link or exported materials.

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

Open the address printed by Vite (usually `http://localhost:5173`). Without nvm, install Node.js 24.21.0 before running the remaining commands.

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

These URLs work in dev, preview, and the hosted demo:

- `/?scenario=conflict`: the first valid POST to free future time creates a competing meeting and returns **409**. The refreshed timeline shows it while all draft fields remain. Choose another free interval and save manually.
- `/?scenario=load-error`: the first valid schedule GET returns **503**. Use “Повторить загрузку” to retry.
- `/?scenario=save-error`: the first valid POST or PATCH returns **503** without writing. Retry saving manually; the draft is preserved.

Scenarios run once per page load; reload/reset rearms them. Invalid or occupied writes do not consume the simulated save/conflict failure. Reload keeps bookings: choose a free interval.

## Scope and limitations

Implemented: date navigation, timeline, full CRUD, domain and server-side mock validation, loading/empty/error/submitting states, conflict recovery, responsive layout, and basic accessibility.

This browser-local demo has no authentication, shared backend, multiple rooms, or cross-tab synchronization. It needs JavaScript, service workers, and HTTPS when hosted (HTTP works on localhost/127.0.0.1). Browser E2E automation and full screen-reader/cross-browser audits are not included. Forced browser suspension/worker termination is not covered; reload if mocking stops.

With more time: connect a real backend, add browser E2E tests and broader accessibility checks, then improve multi-user synchronization if required.

## Hosting preparation

For Vercel: Vite preset, `npm run build`, output `dist`, [Node.js 24.x](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and **`VITE_ENABLE_MOCKS=true` in the build environment**. Ignored local env files are not uploaded; [Vite embeds flags at build time](https://vite.dev/guide/env-and-mode). Serve `/mockServiceWorker.js` as JavaScript over HTTPS. Deployment and hosted smoke checks are the next stage.
