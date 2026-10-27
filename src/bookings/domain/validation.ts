import {
  getLocalDateTime,
  intervalsOverlap,
  isValidBookingDate,
  MAX_DURATION,
  MIN_DURATION,
  TIME_STEP,
  timeToMinutes,
  WORKDAY_END,
  WORKDAY_START,
} from './time'
import type {
  BookingInput,
  BookingValidationContext,
  BookingValidationError,
} from './types'

/** original and bookings are the current, validated records from the store. */
export function validateBooking(
  input: BookingInput,
  { bookings, now, original }: BookingValidationContext,
): BookingValidationError[] {
  const errors: BookingValidationError[] = []
  const validDate = isValidBookingDate(input.date)
  const start = timeToMinutes(input.start)
  const end = timeToMinutes(input.end)

  if (!validDate) errors.push({ code: 'INVALID_DATE', field: 'date' })
  if (start === null) errors.push({ code: 'INVALID_TIME', field: 'start' })
  if (end === null) errors.push({ code: 'INVALID_TIME', field: 'end' })
  if (!validDate || start === null || end === null) return errors

  for (const [field, minutes] of [['start', start], ['end', end]] as const) {
    if (minutes < WORKDAY_START || minutes > WORKDAY_END) {
      errors.push({ code: 'OUTSIDE_WORKING_HOURS', field })
    }
    if (minutes % TIME_STEP !== 0) errors.push({ code: 'INVALID_TIME_STEP', field })
  }

  if (start >= end) {
    errors.push({ code: 'START_NOT_BEFORE_END' })
    return errors
  }

  const duration = end - start
  if (duration < MIN_DURATION) errors.push({ code: 'DURATION_TOO_SHORT' })
  if (duration > MAX_DURATION) errors.push({ code: 'DURATION_TOO_LONG' })

  const current = getLocalDateTime(now)
  const originalStart = original ? timeToMinutes(original.start) : null
  const originalHasStarted = original !== undefined && originalStart !== null && (
    original.date < current.date
    || (original.date === current.date && originalStart <= current.minutes)
  )

  if (originalHasStarted) {
    const scheduleChanged = input.date !== original.date
      || input.start !== original.start || input.end !== original.end
    if (scheduleChanged) errors.push({ code: 'STARTED_BOOKING_TIME_LOCKED' })
    // An unchanged started interval is valid for a title-only edit.
  } else if (input.date < current.date
    || (input.date === current.date && start < current.minutes)) {
    errors.push({ code: 'START_IN_PAST' })
  }

  const bookingIds = bookings.filter((booking) => {
    if (booking.id === original?.id || booking.date !== input.date) return false

    const otherStart = timeToMinutes(booking.start)
    const otherEnd = timeToMinutes(booking.end)
    return otherStart !== null && otherEnd !== null
      && intervalsOverlap(start, end, otherStart, otherEnd)
  }).map((booking) => booking.id)

  if (bookingIds.length > 0) errors.push({ code: 'BOOKING_CONFLICT', bookingIds })
  return errors
}
