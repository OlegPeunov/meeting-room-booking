import { useEffect, useRef, useState } from 'react'
import { bookingsApi } from '../api/bookingsApi'
import { getLocalDateTime, isValidBookingDate, MIN_DURATION, minutesToTime, timeToMinutes } from '../domain/time'
import type { Booking, BookingInput } from '../domain/types'
import { validateBooking } from '../domain/validation'
import { BookingForm } from './BookingForm'
import { DateToolbar } from './DateToolbar'
import { DayTimeline } from './DayTimeline'
import { formatDate } from './dateUtils'
import { useBookings } from './useBookings'

type Editor = {
  key: number
  original?: Booking
  initial: BookingInput
  draft: BookingInput
}

export function BookingPage() {
  const [now, setNow] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateTime(new Date()).date)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const activeDate = editor && isValidBookingDate(editor.draft.date) ? editor.draft.date : selectedDate
  const { bookings, loading, error, reload } = useBookings(activeDate)
  const current = getLocalDateTime(now)
  const original = editor?.original
  // Presentation only: actual editing permission is checked again by validateBooking and the API.
  const locked = original !== undefined && (original.date < current.date
    || (original.date === current.date && timeToMinutes(original.start)! <= current.minutes))
  const errors = editor && !loading && !error
    ? validateBooking(editor.draft, { bookings, now, original }) : []

  useEffect(() => {
    const updateClock = () => setNow(new Date())
    const timer = window.setInterval(updateClock, 15_000)
    window.addEventListener('focus', updateClock)
    document.addEventListener('visibilitychange', updateClock)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateClock)
      document.removeEventListener('visibilitychange', updateClock)
    }
  }, [])

  function canDiscard() {
    return !editor || JSON.stringify(editor.draft) === JSON.stringify(editor.initial)
      || window.confirm('Закрыть форму и потерять несохранённые изменения?')
  }

  function focusSchedule() {
    requestAnimationFrame(() => headingRef.current?.focus())
  }

  function openForm(input: BookingInput, booking?: Booking) {
    if (busy || !canDiscard()) return
    const draft = { ...input, title: input.title ?? '' }
    setEditor((previous) => ({ key: (previous?.key ?? 0) + 1, original: booking, draft, initial: draft }))
    setRequestError(null)
    setAnnouncement('')
  }

  function createAt(start: string) {
    openForm({ date: activeDate, start, end: minutesToTime(timeToMinutes(start)! + MIN_DURATION)! })
  }

  function editBooking(booking: Booking) {
    if (editor?.original?.id === booking.id) return
    openForm({ date: booking.date, start: booking.start, end: booking.end, title: booking.title }, booking)
  }

  function cancel() {
    if (busy || !canDiscard()) return
    setEditor(null)
    setRequestError(null)
    focusSchedule()
  }

  async function save() {
    if (!editor || busy || loading || error) return
    const currentNow = new Date()
    setNow(currentNow)
    if (validateBooking(editor.draft, { bookings, now: currentNow, original: editor.original }).length > 0) return
    setBusy('save')
    setRequestError(null)
    try {
      const saved = editor.original
        ? await bookingsApi.update(editor.original.id, editor.draft)
        : await bookingsApi.create(editor.draft)
      setSelectedDate(saved.date)
      setEditor(null)
      setAnnouncement(editor.original ? 'Изменения сохранены.' : 'Встреча забронирована.')
      reload()
      focusSchedule()
    } catch {
      setRequestError('Не удалось сохранить бронирование. Попробуйте ещё раз.')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!original || busy) return
    setBusy('delete')
    setRequestError(null)
    try {
      await bookingsApi.remove(original.id)
      setSelectedDate(original.date)
      setEditor(null)
      setAnnouncement('Бронирование удалено.')
      reload()
      focusSchedule()
    } catch {
      setRequestError('Не удалось удалить бронирование. Попробуйте ещё раз.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Переговорная комната</p>
          <h1>Meeting Room Booking</h1>
          <p className="page-description">Выберите время для следующей встречи.</p>
        </div>
        <div className="room-meta"><span className="room-indicator" aria-hidden="true" />Рабочий день 09:00–18:00</div>
      </header>
      <DateToolbar date={activeDate} today={current.date} disabled={editor !== null || busy !== null}
        onChange={(date) => { setSelectedDate(date); setAnnouncement('') }} />
      <p className="timezone">Часовой пояс: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      <p className="announcement" role="status">{announcement}</p>
      <div className="workspace">
        <section className="panel schedule-panel" aria-labelledby="schedule-heading" aria-busy={loading}>
          <div className="panel-heading schedule-header">
            <div>
              <p className="eyebrow">Расписание комнаты</p>
              <h2 id="schedule-heading" ref={headingRef} tabIndex={-1}>{formatDate(activeDate)}</h2>
            </div>
            {!loading && !error && <span className="count-badge">Встреч: {bookings.length}</span>}
          </div>
          <div className="legend" aria-label="Обозначения расписания">
            <span><i className="legend-free" />Свободно</span>
            <span><i className="legend-booked" />Занято</span>
            <span><i className="legend-past" />Прошедшее</span>
          </div>
          {loading && <p className="schedule-message" role="status">Загрузка расписания…</p>}
          {error && <div className="schedule-message error-box" role="alert">
            <p>{error}</p><button type="button" className="text-button" onClick={reload}>Повторить загрузку</button>
          </div>}
          {!loading && !error && bookings.length === 0 && <p className="empty-day">В этот день встреч пока нет.</p>}
          <DayTimeline date={activeDate} bookings={bookings} now={now}
            disabled={loading || error !== null || busy !== null}
            selectedId={editor?.original?.id} selectedStart={editor && !editor.original ? editor.draft.start : undefined}
            onCreate={createAt} onEdit={editBooking} />
        </section>
        <aside className="editor-column" aria-label="Бронирование встречи">
          {editor ? <BookingForm key={editor.key} draft={editor.draft} original={editor.original}
            bookings={bookings} now={now} today={current.date} locked={locked} loading={loading}
            unavailable={error !== null} busy={busy} errors={errors} requestError={requestError}
            onChange={(draft) => { setEditor({ ...editor, draft }); setRequestError(null) }}
            onSave={() => { void save() }} onDelete={() => { void remove() }} onCancel={cancel} />
          : <section className="panel form-placeholder" aria-labelledby="placeholder-heading">
            <div className="placeholder-mark" aria-hidden="true">+</div>
            <p className="eyebrow">Ваша следующая встреча</p>
            <h2 id="placeholder-heading">Начните со времени</h2>
            <p className="muted">Нажмите на свободный интервал слева, чтобы забронировать комнату, или выберите встречу для редактирования.</p>
            <div className="placeholder-note">30 минут — 2 часа<span>Длительность одной встречи</span></div>
          </section>}
        </aside>
      </div>
    </main>
  )
}
