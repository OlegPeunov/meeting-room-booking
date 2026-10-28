import { setupWorker } from 'msw/browser'
import { createHandlers } from './handlers'
import { createBookingStore } from './store'
import type { BookingStorage } from './store'

const workerNotifications = new Set([
  'MOCKING_ENABLED', 'INTEGRITY_CHECK_RESPONSE', 'KEEPALIVE_RESPONSE', 'CLIENT_CLOSED',
])

export async function startBrowserMocks() {
  let storage: BookingStorage | undefined
  try {
    storage = window.sessionStorage
  } catch {
    console.warn('sessionStorage is unavailable; demo changes will not survive a reload.')
  }
  const store = createBookingStore({ storage })
  const scenario = new URLSearchParams(window.location.search).get('scenario') ?? undefined
  const worker = setupWorker(...createHandlers(store, { scenario }))
  // MSW 3.0.3 awaits replies to these notifications (mswjs/msw#2801).
  // Without an acknowledgement Chromium terminates the worker after about five minutes.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (workerNotifications.has(event.data?.type)) event.ports[0]?.postMessage(null)
  })
  await worker.start({
    serviceWorker: { url: import.meta.env.BASE_URL + 'mockServiceWorker.js' },
    onUnhandledFrame: 'bypass',
    quiet: true,
  })
}
