import { http, HttpResponse } from 'msw/http'
import { isBookingPatch, parseBookingInput } from '../bookings/api/contracts'
import type { ApiErrorBody } from '../bookings/api/contracts'
import { isValidBookingDate } from '../bookings/domain/time'
import type { BookingValidationError } from '../bookings/domain/types'
import { validateBooking } from '../bookings/domain/validation'
import type { BookingStore } from './store'

function error(status: number, code: ApiErrorBody['code'], errors?: BookingValidationError[]) {
  return HttpResponse.json<ApiErrorBody>({ code, ...(errors ? { errors } : {}) }, { status })
}

function validationError(errors: BookingValidationError[]) {
  // A request violating time rules is 422 even if it also overlaps another booking.
  const conflictOnly = errors.every((item) => item.code === 'BOOKING_CONFLICT')
  return error(conflictOnly ? 409 : 422, conflictOnly ? 'BOOKING_CONFLICT' : 'VALIDATION_ERROR', errors)
}

export function createHandlers(store: BookingStore, {
  now = () => new Date(), scenario,
}: { now?: () => Date; scenario?: string } = {}) {
  let conflictPending = scenario === 'conflict'
  let loadErrorPending = scenario === 'load-error'
  let saveErrorPending = scenario === 'save-error'

  return [
    http.get('*/api/bookings', ({ request }) => {
      const date = new URL(request.url).searchParams.get('date') ?? ''
      if (!isValidBookingDate(date)) {
        return error(422, 'VALIDATION_ERROR', [{ code: 'INVALID_DATE', field: 'date' }])
      }
      if (loadErrorPending) {
        loadErrorPending = false
        return error(503, 'SERVICE_UNAVAILABLE')
      }
      const bookings = store.getAll().filter((booking) => booking.date === date)
        .sort((a, b) => a.start.localeCompare(b.start))
      return HttpResponse.json(bookings)
    }),
    http.post('*/api/bookings', async ({ request }) => {
      const input = parseBookingInput(await request.json().catch(() => null))
      if (!input) return error(422, 'INVALID_REQUEST')
      const current = now()
      const errors = validateBooking(input, { bookings: store.getAll(), now: current })
      if (errors.length > 0) return validationError(errors)

      if (saveErrorPending) {
        saveErrorPending = false
        return error(503, 'SERVICE_UNAVAILABLE')
      }
      // No awaits between validation and write: concurrent requests cannot both win.
      if (conflictPending) {
        conflictPending = false
        store.save({ ...input, id: crypto.randomUUID(), title: 'Конкурирующая встреча' })
        return validationError(validateBooking(input, { bookings: store.getAll(), now: current }))
      }
      const booking = { ...input, id: crypto.randomUUID() }
      store.save(booking)
      return HttpResponse.json(booking, { status: 201 })
    }),
    http.patch('*/api/bookings/:id', async ({ params, request }) => {
      const changes: unknown = await request.json().catch(() => null)
      // Read original after the async body read, so it is the latest stored record.
      const original = store.getAll().find((booking) => booking.id === params.id)
      if (!original) return error(404, 'BOOKING_NOT_FOUND')
      if (!isBookingPatch(changes)) return error(422, 'INVALID_REQUEST')
      const input = parseBookingInput({ ...original, ...changes })
      if (!input) return error(422, 'INVALID_REQUEST')
      const errors = validateBooking(input, { bookings: store.getAll(), now: now(), original })
      if (errors.length > 0) return validationError(errors)
      if (saveErrorPending) {
        saveErrorPending = false
        return error(503, 'SERVICE_UNAVAILABLE')
      }
      const booking = { ...input, id: original.id }
      store.save(booking)
      return HttpResponse.json(booking)
    }),
    http.delete('*/api/bookings/:id', ({ params }) => {
      const original = store.getAll().find((booking) => booking.id === params.id)
      if (!original) return error(404, 'BOOKING_NOT_FOUND')
      store.remove(original.id)
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('*/api/demo/reset', () => {
      store.reset()
      conflictPending = scenario === 'conflict'
      loadErrorPending = scenario === 'load-error'
      saveErrorPending = scenario === 'save-error'
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}
