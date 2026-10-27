import { describe, expect, it } from 'vitest'
import {
  getLocalDateTime,
  intervalsOverlap,
  isValidBookingDate,
  minutesToTime,
  timeToMinutes,
} from './time'

describe('time conversion', () => {
  it.each([
    ['00:00', 0], ['09:00', 540], ['18:00', 1080], ['23:59', 1439],
  ])('converts %s to %i minutes', (time, minutes) => {
    expect(timeToMinutes(time)).toBe(minutes)
    expect(minutesToTime(minutes)).toBe(time)
  })

  it.each(['9:00', '09:0', '24:00', '12:60', '-1:00', '09:00:00', '', ' 09:00']) (
    'rejects invalid time %j', (time) => {
      expect(timeToMinutes(time)).toBeNull()
    },
  )

  it.each([-1, 1440, 30.5, NaN, Infinity])('rejects invalid minutes %s', (minutes) => {
    expect(minutesToTime(minutes)).toBeNull()
  })
})

describe('calendar dates', () => {
  it.each(['2026-10-27', '2024-02-29', '2000-02-29'])('accepts %s', (date) => {
    expect(isValidBookingDate(date)).toBe(true)
  })

  it.each([
    '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-10', '2026-13-01',
    '2026-10-00', '0000-01-01', '2026-1-01', 'not-a-date',
  ])('rejects %s', (date) => {
    expect(isValidBookingDate(date)).toBe(false)
  })
})

describe('explicit local clock', () => {
  it('keeps the local calendar date at midnight', () => {
    expect(getLocalDateTime(new Date(2026, 9, 27, 0, 0))).toEqual({
      date: '2026-10-27', minutes: 0,
    })
  })

  it('preserves seconds and milliseconds', () => {
    expect(getLocalDateTime(new Date(2026, 11, 31, 23, 59, 30, 500))).toEqual({
      date: '2026-12-31', minutes: 1439 + 30 / 60 + 500 / 60_000,
    })
  })

  it('rejects an invalid clock value', () => {
    expect(() => getLocalDateTime(new Date(NaN))).toThrow(RangeError)
  })
})

describe('half-open interval overlap', () => {
  it.each([
    [600, 660, 630, 690, true],
    [600, 660, 570, 630, true],
    [600, 660, 600, 660, true],
    [600, 720, 630, 660, true],
    [630, 660, 600, 720, true],
    [600, 660, 660, 720, false],
    [660, 720, 600, 660, false],
    [600, 660, 720, 780, false],
  ])('%i–%i vs %i–%i: %s', (start, end, otherStart, otherEnd, overlaps) => {
    expect(intervalsOverlap(start, end, otherStart, otherEnd)).toBe(overlaps)
  })
})
