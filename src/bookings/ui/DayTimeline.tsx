import { Fragment } from 'react'
import { getLocalDateTime, minutesToTime, TIME_STEP, timeToMinutes, WORKDAY_END, WORKDAY_START } from '../domain/time'
import type { Booking } from '../domain/types'
import { validateBooking } from '../domain/validation'

type Props = {
  date: string
  bookings: Booking[]
  now: Date
  disabled: boolean
  selectedId?: string
  selectedStart?: string
  onCreate: (start: string) => void
  onEdit: (booking: Booking) => void
}

const slots = Array.from({ length: (WORKDAY_END - WORKDAY_START) / TIME_STEP },
  (_, index) => WORKDAY_START + index * TIME_STEP)

export function DayTimeline({ date, bookings, now, disabled, selectedId, selectedStart, onCreate, onEdit }: Props) {
  const current = getLocalDateTime(now)
  return (
    <div className="timeline" aria-label="Расписание с 09:00 до 18:00">
      {slots.map((minutes, index) => {
        const start = minutesToTime(minutes)!
        const end = minutesToTime(minutes + TIME_STEP)!
        const covered = bookings.some((booking) => minutes >= timeToMinutes(booking.start)!
          && minutes < timeToMinutes(booking.end)!)
        const errors = validateBooking({ date, start, end }, { bookings, now })
        const past = errors.some((error) => error.code === 'START_IN_PAST')
        const available = errors.length === 0
        const booking = bookings.find((item) => item.start === start)
        const ended = booking !== undefined && (booking.date < current.date
          || (booking.date === current.date && timeToMinutes(booking.end)! <= current.minutes))
        return (
          <Fragment key={start}>
            <span className="time-label" style={{ gridRow: index + 1 }}>{start}</span>
            <div className={'slot-cell' + (past ? ' slot-past' : '')} style={{ gridRow: index + 1 }}>
              {!covered && <button type="button"
                className={'slot-button' + (selectedStart === start ? ' slot-selected' : '')}
                disabled={disabled || !available}
                aria-label={(past ? 'Прошедшее время ' : 'Забронировать ') + start + '–' + end}
                onClick={() => onCreate(start)}>
                <span>{past ? 'Прошедшее время' : 'Свободно'}</span>
                {!past && <span aria-hidden="true" className="slot-plus">+</span>}
              </button>}
            </div>
            {booking && <button type="button"
              className={'booking-block' + (ended ? ' booking-ended' : '') + (selectedId === booking.id ? ' booking-selected' : '')}
              style={{ gridRow: (index + 1) + ' / span ' + ((timeToMinutes(booking.end)! - minutes) / TIME_STEP) }}
              disabled={disabled}
              aria-label={'Редактировать: ' + (booking.title || 'Без названия') + ', ' + booking.start + '–' + booking.end}
              onClick={() => onEdit(booking)}>
              <span className="booking-title">{booking.title || 'Без названия'}</span>
              <span className="booking-time">{booking.start}–{booking.end}{ended ? ' · Завершена' : ''}</span>
            </button>}
          </Fragment>
        )
      })}
      <span className="time-label time-label-end" style={{ gridRow: slots.length + 1 }}>18:00</span>
    </div>
  )
}
