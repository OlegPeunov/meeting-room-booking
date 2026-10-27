import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Booking } from '../bookings/domain/types'
import { validateBooking } from '../bookings/domain/validation'
import { createBookingStore, createDemoBookings, STORAGE_KEY } from './store'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}
const clock = new Date(2026, 9, 27, 23, 59, 59)
const booking: Booking = { id: 'custom', date: '2026-10-28', start: '09:00', end: '09:30' }
afterEach(() => vi.restoreAllMocks())

describe('demo store', () => {
  it.each([clock, new Date(2026, 11, 31, 23, 59), new Date(2024, 1, 28, 23, 59)])(
    'seeds future non-overlapping bookings relative to %s', (now) => {
      const rows = createDemoBookings(now)
      expect(rows).toHaveLength(3)
      for (const row of rows) {
        expect(validateBooking(row, { now, bookings: rows, original: row })).toEqual([])
        expect(validateBooking(row, { now, bookings: [] })).toEqual([])
      }
    },
  )

  it('persists create, update and delete across store recreation', () => {
    const storage = memoryStorage()
    const options = { storage, now: () => clock }
    const first = createBookingStore(options)
    first.save(booking)
    const second = createBookingStore(options)
    expect(second.getAll()).toContainEqual(booking)
    second.save({ ...booking, title: 'Updated' })
    const third = createBookingStore(options)
    expect(third.getAll()).toContainEqual({ ...booking, title: 'Updated' })
    third.remove(booking.id)
    expect(createBookingStore(options).getAll().some((row) => row.id === booking.id)).toBe(false)
  })

  it('preserves an empty stored list instead of reseeding it', () => {
    const storage = memoryStorage()
    const first = createBookingStore({ storage, now: () => clock })
    first.getAll().forEach((row) => first.remove(row.id))
    expect(createBookingStore({ storage, now: () => clock }).getAll()).toEqual([])
  })

  it('preserves bookings that became past after a reload', () => {
    const storage = memoryStorage()
    const first = createBookingStore({ storage, now: () => clock })
    first.save(booking)
    expect(createBookingStore({ storage, now: () => new Date(2027, 0, 1) }).getAll())
      .toEqual(first.getAll())
  })

  it.each([
    '{bad json',
    JSON.stringify([{ id: 'invalid' }]),
    JSON.stringify([{ ...booking, start: '08:00' }]),
    JSON.stringify([booking, booking]),
    JSON.stringify([booking, { ...booking, id: 'overlapping' }]),
  ])('recovers unusable storage: %s', (raw) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, raw)
    expect(createBookingStore({ storage, now: () => clock }).getAll())
      .toEqual(createDemoBookings(clock))
  })

  it('resets using the current date and persists the fresh data', () => {
    const storage = memoryStorage()
    let current = clock
    const options = { storage, now: () => current }
    const store = createBookingStore(options)
    store.save(booking)
    current = new Date(2026, 11, 31, 23, 59)
    store.reset()
    expect(store.getAll()).toEqual(createDemoBookings(current))
    expect(createBookingStore(options).getAll()).toEqual(store.getAll())
    expect(store.getAll()[0].date).toBe('2027-01-01')
  })

  it('keeps working in memory if browser storage is blocked', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = {
      getItem: () => { throw new Error('Blocked') },
      setItem: () => { throw new Error('Quota exceeded') },
    }
    const store = createBookingStore({ storage, now: () => clock })
    store.save(booking)
    expect(store.getAll()).toContainEqual(booking)
    store.remove(booking.id)
    expect(store.getAll()).not.toContainEqual(booking)
  })

  it('does not expose mutable references', () => {
    const store = createBookingStore({ now: () => clock })
    const draft = { ...booking }
    store.save(draft)
    draft.title = 'Changed externally'
    const rows = store.getAll()
    rows[0].title = 'Changed externally'
    expect(store.getAll().some((row) => row.title === 'Changed externally')).toBe(false)
  })
})
