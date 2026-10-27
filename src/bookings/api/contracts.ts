import type { Booking, BookingInput, BookingValidationError } from '../domain/types'

export type ApiErrorBody = {
  code: 'INVALID_REQUEST' | 'VALIDATION_ERROR' | 'BOOKING_CONFLICT' | 'BOOKING_NOT_FOUND'
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
