import { describe, expect, it } from 'vitest'
import type { Booking, BookingInput } from './types'
import { validateBooking } from './validation'

const input: BookingInput = {
  date: '2026-10-27', start: '10:00', end: '11:00', title: 'Planning',
}
const morning = new Date(2026, 9, 27, 8, 0)
const original: Booking = { id: 'current', ...input }

function validate(changes: Partial<BookingInput> = {}) {
  return validateBooking({ ...input, ...changes }, { bookings: [], now: morning })
}

describe('working hours and duration', () => {
  it.each([
    ['09:00', '09:30'], ['16:00', '18:00'], ['17:30', '18:00'],
  ])('accepts boundary interval %s–%s', (start, end) => {
    expect(validate({ start, end })).toEqual([])
  })

  it.each([
    ['08:30', '09:30', 'start'],
    ['18:30', '19:00', 'start'],
    ['09:00', '18:30', 'end'],
    ['08:00', '08:30', 'end'],
  ])('rejects working-hours violation %s–%s (%s)', (start, end, field) => {
    expect(validate({ start, end })).toContainEqual({ code: 'OUTSIDE_WORKING_HOURS', field })
  })

  it.each([
    ['10:15', '11:00', 'start'], ['10:00', '11:15', 'end'],
  ])('rejects an off-grid %s–%s (%s)', (start, end, field) => {
    expect(validate({ start, end })).toContainEqual({ code: 'INVALID_TIME_STEP', field })
  })

  it.each([['10:00', '10:00'], ['11:00', '10:00']])(
    'requires start before end for %s–%s', (start, end) => {
      expect(validate({ start, end })).toEqual([{ code: 'START_NOT_BEFORE_END' }])
    },
  )

  it('rejects a duration shorter than 30 minutes', () => {
    expect(validate({ end: '10:15' })).toContainEqual({ code: 'DURATION_TOO_SHORT' })
  })

  it('rejects a duration longer than 2 hours', () => {
    expect(validate({ end: '12:30' })).toEqual([{ code: 'DURATION_TOO_LONG' }])
  })
})

describe('input format', () => {
  it.each([
    [{ date: '2026-02-30' }, { code: 'INVALID_DATE', field: 'date' }],
    [{ start: '9:00' }, { code: 'INVALID_TIME', field: 'start' }],
    [{ end: '24:00' }, { code: 'INVALID_TIME', field: 'end' }],
  ])('rejects invalid field %j', (changes, error) => {
    expect(validate(changes)).toEqual([error])
  })

  it('returns multiple format errors without interval errors', () => {
    expect(validate({ date: '', start: '', end: '' })).toEqual([
      { code: 'INVALID_DATE', field: 'date' },
      { code: 'INVALID_TIME', field: 'start' },
      { code: 'INVALID_TIME', field: 'end' },
    ])
  })
})

describe('booking conflicts', () => {
  it('reports the IDs of all overlapping bookings on the same date', () => {
    const bookings: Booking[] = [
      { id: 'first', ...input, start: '09:30', end: '10:30' },
      { id: 'second', ...input, start: '10:30', end: '11:30' },
      { id: 'tomorrow', ...input, date: '2026-10-28' },
    ]
    expect(validateBooking(input, { bookings, now: morning })).toEqual([
      { code: 'BOOKING_CONFLICT', bookingIds: ['first', 'second'] },
    ])
  })

  it('accepts both touching neighbours and a booking on another date', () => {
    const bookings: Booking[] = [
      { id: 'before', ...input, start: '09:00', end: '10:00' },
      { id: 'after', ...input, start: '11:00', end: '12:00' },
      { id: 'tomorrow', ...input, date: '2026-10-28' },
    ]
    expect(validateBooking(input, { bookings, now: morning })).toEqual([])
  })

  it('excludes only the original booking during editing', () => {
    const other: Booking = { id: 'other', ...input, start: '11:00', end: '12:00' }
    expect(validateBooking(input, { bookings: [original, other], now: morning, original }))
      .toEqual([])
    expect(validateBooking({ ...input, end: '11:30' }, {
      bookings: [original, other], now: morning, original,
    })).toEqual([{ code: 'BOOKING_CONFLICT', bookingIds: ['other'] }])
  })

  it('does not ignore an existing booking when creating an identical interval', () => {
    expect(validateBooking(input, { bookings: [original], now: morning })).toEqual([
      { code: 'BOOKING_CONFLICT', bookingIds: ['current'] },
    ])
  })
})

describe('past time', () => {
  it.each([
    new Date(2026, 9, 28, 8, 0),
    new Date(2026, 9, 27, 10, 30),
    new Date(2026, 9, 27, 10, 0, 1),
    new Date(2026, 9, 27, 10, 0, 0, 1),
  ])('rejects creation with a start before the explicit clock %s', (now) => {
    expect(validateBooking(input, { bookings: [], now })).toEqual([{ code: 'START_IN_PAST' }])
  })

  it('accepts creation exactly at the start time', () => {
    expect(validateBooking(input, { bookings: [], now: new Date(2026, 9, 27, 10, 0) }))
      .toEqual([])
  })

  it('accepts a future day even when the current time is after working hours', () => {
    expect(validateBooking({ ...input, date: '2026-10-28', start: '09:00', end: '09:30' }, {
      bookings: [], now: new Date(2026, 9, 27, 23, 59, 59),
    })).toEqual([])
  })

  it('recognises the previous date after local midnight', () => {
    expect(validateBooking(input, { bookings: [], now: new Date(2026, 9, 28, 0, 0) }))
      .toEqual([{ code: 'START_IN_PAST' }])
  })
})

describe('editing', () => {
  it.each([
    new Date(2026, 9, 27, 10, 0),
    new Date(2026, 9, 27, 10, 30),
    new Date(2026, 9, 27, 11, 0),
    new Date(2026, 9, 28, 8, 0),
  ])('allows a title-only edit after the booking has started: %s', (now) => {
    expect(validateBooking({ ...input, title: 'Updated title' }, {
      bookings: [original], now, original,
    })).toEqual([])
  })

  it('allows removing the optional title of a completed booking', () => {
    const { date, start, end } = input
    expect(validateBooking({ date, start, end }, {
      bookings: [original], now: new Date(2026, 9, 28, 8, 0), original,
    })).toEqual([])
  })

  it.each([
    { date: '2026-10-28' },
    { start: '10:30' },
    { end: '11:30' },
  ])('locks a started booking schedule: %j', (changes) => {
    expect(validateBooking({ ...input, ...changes }, {
      bookings: [original], now: new Date(2026, 9, 27, 10, 30), original,
    })).toEqual([{ code: 'STARTED_BOOKING_TIME_LOCKED' }])
  })

  it('locks a completed booking against moving it to a future day', () => {
    expect(validateBooking({ ...input, date: '2026-10-29' }, {
      bookings: [original], now: new Date(2026, 9, 28, 8, 0), original,
    })).toEqual([{ code: 'STARTED_BOOKING_TIME_LOCKED' }])
  })

  it('rechecks the original start if time passed while editing', () => {
    const changed = { ...input, start: '11:00', end: '12:00' }
    expect(validateBooking(changed, {
      bookings: [original], now: new Date(2026, 9, 27, 9, 59, 59), original,
    })).toEqual([])
    expect(validateBooking(changed, {
      bookings: [original], now: new Date(2026, 9, 27, 10, 0), original,
    })).toEqual([{ code: 'STARTED_BOOKING_TIME_LOCKED' }])
  })

  it.each(['2026-10-26', '2026-10-27'])(
    'cannot move a future booking into the past on %s', (date) => {
      const future = { ...original, date: '2026-10-28' }
      expect(validateBooking({ ...input, date }, {
        bookings: [future], now: new Date(2026, 9, 27, 12, 0), original: future,
      })).toEqual([{ code: 'START_IN_PAST' }])
    },
  )

  it('moves a future booking to another time and date', () => {
    expect(validateBooking({ ...input, date: '2026-10-28', start: '14:00', end: '16:00' }, {
      bookings: [original], now: morning, original,
    })).toEqual([])
  })

  it('checks the destination date when moving a future booking', () => {
    const other = { ...original, id: 'destination', date: '2026-10-28' }
    expect(validateBooking({ ...input, date: '2026-10-28' }, {
      bookings: [original, other], now: morning, original,
    })).toEqual([{ code: 'BOOKING_CONFLICT', bookingIds: ['destination'] }])
  })

  it('does not mutate the draft, original or existing bookings', () => {
    const draft = Object.freeze({ ...input, title: 'New title' })
    const stored = Object.freeze({ ...original })
    const bookings = Object.freeze([stored])
    expect(validateBooking(draft, { bookings, now: morning, original: stored })).toEqual([])
    expect(stored.title).toBe('Planning')
    expect(draft.title).toBe('New title')
  })
})
