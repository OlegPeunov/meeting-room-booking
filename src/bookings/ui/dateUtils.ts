import { getLocalDateTime, isValidBookingDate } from '../domain/time'

function localDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(0)
  value.setHours(12, 0, 0, 0)
  value.setFullYear(year, month - 1, day)
  return value
}

export function shiftDate(date: string, days: number): string {
  const value = localDate(date)
  value.setDate(value.getDate() + days)
  const result = getLocalDateTime(value).date
  return isValidBookingDate(result) ? result : date
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(localDate(date))
}
