import { setupWorker } from 'msw/browser'
import { createHandlers } from './handlers'
import { createBookingStore } from './store'
import type { BookingStorage } from './store'

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
  await worker.start({
    serviceWorker: { url: import.meta.env.BASE_URL + 'mockServiceWorker.js' },
    onUnhandledFrame: 'bypass',
    quiet: true,
  })
}
