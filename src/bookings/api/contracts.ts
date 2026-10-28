import type { Booking, BookingInput, BookingValidationError } from '../domain/types'

export type ApiErrorBody = {
  code: 'INVALID_REQUEST' | 'VALIDATION_ERROR' | 'BOOKING_CONFLICT' | 'BOOKING_NOT_FOUND' | 'SERVICE_UNAVAILABLE'
  errors?: BookingValidationError[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Only checks the wire shape; business rules belong to domain/validation. */
export function parseBookingInput(value: unknown): BookingInput | null {
  if (!isRecord(value) || typeof value.date !== 'string'
    || typeof value.start !== 'string' || typeof value.end !== 'string'
    || (value.title !== undefined && typeof value.title !== 'string')) return null

  return {
    date: value.date, start: value.start, end: value.end,
    ...(value.title === undefined ? {} : { title: value.title }),
  }
}

export function isBooking(value: unknown): value is Booking {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
    && parseBookingInput(value) !== null
}

export function isBookingPatch(value: unknown): value is Partial<BookingInput> {
  return isRecord(value) && Object.entries(value).every(([key, field]) => (
    ['date', 'start', 'end', 'title'].includes(key) && typeof field === 'string'
  ))
}

/** Ignore malformed/unknown error details instead of exposing untyped wire data to the UI. */
export function isBookingValidationError(value: unknown): value is BookingValidationError {
  if (!isRecord(value)) return false
  switch (value.code) {
    case 'INVALID_DATE': return value.field === 'date'
    case 'INVALID_TIME':
    case 'OUTSIDE_WORKING_HOURS':
    case 'INVALID_TIME_STEP': return value.field === 'start' || value.field === 'end'
    case 'BOOKING_CONFLICT':
      return Array.isArray(value.bookingIds) && value.bookingIds.every((id) => typeof id === 'string')
    case 'START_NOT_BEFORE_END':
    case 'DURATION_TOO_SHORT':
    case 'DURATION_TOO_LONG':
    case 'START_IN_PAST':
    case 'STARTED_BOOKING_TIME_LOCKED': return true
    default: return false
  }
}
