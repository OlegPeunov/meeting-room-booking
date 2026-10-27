export const WORKDAY_START = 9 * 60
export const WORKDAY_END = 18 * 60
export const TIME_STEP = 30
export const MIN_DURATION = 30
export const MAX_DURATION = 2 * 60

/** Parse a 24-hour HH:mm value. Invalid input is represented by null. */
export function timeToMinutes(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null

  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    return null
  }

  return [Math.floor(minutes / 60), minutes % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function isValidBookingDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

  const [year, month, day] = date.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

/** Uses local getters; no implicit clock access or UTC date conversion. */
export function getLocalDateTime(now: Date): { date: string; minutes: number } {
  if (Number.isNaN(now.getTime())) throw new RangeError('Invalid current time')

  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-')
  const minutes = now.getHours() * 60 + now.getMinutes()
    + now.getSeconds() / 60 + now.getMilliseconds() / 60_000

  return { date, minutes }
}

/** Half-open intervals: an end touching another start is not an overlap. */
export function intervalsOverlap(
  start: number,
  end: number,
  otherStart: number,
  otherEnd: number,
): boolean {
  return start < otherEnd && otherStart < end
}
