export type Booking = {
  id: string
  date: string // Local calendar date, YYYY-MM-DD.
  start: string // HH:mm.
  end: string // HH:mm.
  title?: string
}

export type BookingInput = Omit<Booking, 'id'>

export type BookingValidationContext = {
  bookings: readonly Booking[]
  now: Date
  original?: Booking
}

export type BookingValidationError =
  | { code: 'INVALID_DATE'; field: 'date' }
  | {
      code: 'INVALID_TIME' | 'OUTSIDE_WORKING_HOURS' | 'INVALID_TIME_STEP'
      field: 'start' | 'end'
    }
  | {
      code:
        | 'START_NOT_BEFORE_END'
        | 'DURATION_TOO_SHORT'
        | 'DURATION_TOO_LONG'
        | 'START_IN_PAST'
        | 'STARTED_BOOKING_TIME_LOCKED'
    }
  | { code: 'BOOKING_CONFLICT'; bookingIds: string[] }
