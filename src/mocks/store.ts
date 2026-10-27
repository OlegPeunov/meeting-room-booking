import { isBooking } from '../bookings/api/contracts'
import { getLocalDateTime } from '../bookings/domain/time'
import type { Booking } from '../bookings/domain/types'
import { validateBooking } from '../bookings/domain/validation'

export const STORAGE_KEY = 'meeting-room-booking:bookings:v1'
export type BookingStorage = Pick<Storage, 'getItem' | 'setItem'>

export function createDemoBookings(now: Date): Booking[] {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const nextDay = new Date(tomorrow)
  nextDay.setDate(nextDay.getDate() + 1)
  return [
    { id: 'demo-planning', date: getLocalDateTime(tomorrow).date,
      start: '10:00', end: '11:00', title: 'Планирование' },
    { id: 'demo-interview', date: getLocalDateTime(tomorrow).date,
      start: '14:00', end: '15:00', title: 'Собеседование' },
    { id: 'demo-review', date: getLocalDateTime(nextDay).date,
      start: '11:00', end: '12:00', title: 'Обсуждение проекта' },
  ]
}

export function createBookingStore({ storage, now = () => new Date() }: {
  storage?: BookingStorage
  now?: () => Date
} = {}) {
  function load(): Booking[] | null {
    if (!storage) return null
    try {
      const raw = storage.getItem(STORAGE_KEY)
      if (raw === null) return null
      const rows: unknown = JSON.parse(raw)
      if (!Array.isArray(rows) || !rows.every(isBooking)) return null
      if (new Set(rows.map((booking) => booking.id)).size !== rows.length) return null
      const current = now()
      // original allows valid persisted bookings to become past without losing them.
      if (rows.some((booking) => validateBooking(booking, {
        bookings: rows, now: current, original: booking,
      }).length > 0)) return null
      return rows
    } catch {
      console.warn('Demo storage could not be read; using fresh in-memory data.')
      return null
    }
  }

  let bookings = load() ?? createDemoBookings(now())

  function persist() {
    if (!storage) return
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(bookings))
    } catch {
      console.warn('Demo storage could not be written; changes remain in memory only.')
    }
  }
  persist()

  // Mutations are called by handlers only after domain validation.
  return {
    getAll: () => bookings.map((booking) => ({ ...booking })),
    save(booking: Booking) {
      bookings = [...bookings.filter((item) => item.id !== booking.id), { ...booking }]
      persist()
    },
    remove(id: string) {
      bookings = bookings.filter((booking) => booking.id !== id)
      persist()
    },
    reset() {
      bookings = createDemoBookings(now())
      persist()
    },
  }
}

export type BookingStore = ReturnType<typeof createBookingStore>
