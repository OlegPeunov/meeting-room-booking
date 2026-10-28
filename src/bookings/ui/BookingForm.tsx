import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { MAX_DURATION, MIN_DURATION, minutesToTime, TIME_STEP, timeToMinutes, WORKDAY_END, WORKDAY_START } from '../domain/time'
import type { Booking, BookingInput, BookingValidationError } from '../domain/types'
import { validateBooking } from '../domain/validation'
import { validationMessages } from './errorMessages'

type Props = {
  draft: BookingInput
  original?: Booking
  bookings: Booking[]
  now: Date
  today: string
  locked: boolean
  loading: boolean
  unavailable: boolean
  missing: boolean
  onRetryLoad: () => void
  onContinueAsNew: () => void
  busy: 'save' | 'delete' | null
  errors: BookingValidationError[]
  requestError: string | null
  onChange: (draft: BookingInput) => void
  onSave: () => void
  onDelete: () => void
  onCancel: () => void
}

const startTimes = Array.from({ length: (WORKDAY_END - WORKDAY_START) / TIME_STEP },
  (_, index) => minutesToTime(WORKDAY_START + index * TIME_STEP)!)
const endTimes = Array.from({ length: startTimes.length },
  (_, index) => minutesToTime(WORKDAY_START + (index + 1) * TIME_STEP)!)

export function BookingForm({ draft, original, bookings, now, today, locked, loading,
  unavailable, missing, onRetryLoad, onContinueAsNew, busy, errors, requestError, onChange, onSave, onDelete, onCancel }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const context = { bookings, now, original }
  const errorMessages = validationMessages(errors).filter((message) => message !== requestError)

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
    if (window.matchMedia('(max-width: 800px)').matches) {
      panelRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [])

  useEffect(() => {
    if (requestError) errorRef.current?.focus()
  }, [requestError])

  function changeStart(start: string) {
    const minutes = timeToMinutes(start)!
    const duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION,
      timeToMinutes(draft.end)! - timeToMinutes(draft.start)!))
    const preferred = { ...draft, start, end: minutesToTime(Math.min(minutes + duration, WORKDAY_END))! }
    const fallback = { ...draft, start, end: minutesToTime(minutes + MIN_DURATION)! }
    onChange(validateBooking(preferred, context).length === 0 ? preferred : fallback)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave()
  }

  return (
    <section className="panel form-panel" ref={panelRef} aria-labelledby="form-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{original ? 'Ваша встреча' : 'Новая встреча'}</p>
          <h2 id="form-heading">{original ? 'Редактирование' : 'Бронирование'}</h2>
        </div>
        <button type="button" className="icon-button" aria-label="Закрыть форму" disabled={busy !== null}
          onClick={onCancel}>×</button>
      </div>
      {locked && <p className="notice">Встреча уже началась или завершилась. Можно изменить название или удалить бронь.</p>}
      {locked && original && (draft.date !== original.date || draft.start !== original.start || draft.end !== original.end)
        && <button type="button" className="text-button recovery-action" disabled={busy !== null}
          onClick={() => onChange({ ...draft, date: original.date, start: original.start, end: original.end })}>
          Вернуть исходное время
        </button>}
      <form noValidate onSubmit={submit} aria-busy={busy !== null}>
        <fieldset disabled={busy !== null} className="form-fields">
          <label htmlFor="booking-date">Дата встречи</label>
          <input id="booking-date" type="date" value={draft.date} min={today} max="9999-12-31"
            required disabled={locked} aria-describedby={errors.length ? 'booking-errors' : undefined}
            onChange={(event) => onChange({ ...draft, date: event.target.value })} />
          <div className="time-fields">
            <div>
              <label htmlFor="booking-start">Начало</label>
              <select id="booking-start" value={draft.start} disabled={locked || loading || unavailable}
                aria-describedby="duration-hint" onChange={(event) => changeStart(event.target.value)}>
                {startTimes.map((start) => {
                  const candidate = { ...draft, start, end: minutesToTime(timeToMinutes(start)! + MIN_DURATION)! }
                  return <option key={start} value={start}
                    disabled={!locked && validateBooking(candidate, context).length > 0}>{start}</option>
                })}
              </select>
            </div>
            <div>
              <label htmlFor="booking-end">Окончание</label>
              <select id="booking-end" value={draft.end} disabled={locked || loading || unavailable}
                aria-describedby="duration-hint" onChange={(event) => onChange({ ...draft, end: event.target.value })}>
                {endTimes.map((end) => <option key={end} value={end}
                  disabled={!locked && validateBooking({ ...draft, end }, context).length > 0}>{end}</option>)}
              </select>
            </div>
          </div>
          <p className="field-hint" id="duration-hint">От 30 минут до 2 часов · шаг 30 минут</p>
          <label htmlFor="booking-title">Название встречи <span className="optional">необязательно</span></label>
          <input id="booking-title" ref={titleRef} type="text" value={draft.title ?? ''}
            placeholder="Например, обсуждение проекта" onChange={(event) => onChange({ ...draft, title: event.target.value })} />
        </fieldset>
        {errorMessages.length > 0 && <ul className="error-box" id="booking-errors" aria-live="polite">
          {errorMessages.map((message) => <li key={message}>{message}</li>)}
        </ul>}
        {requestError && <p ref={errorRef} className="error-box" role="alert" tabIndex={-1}>{requestError}</p>}
        {loading && <p className="field-hint form-load-status" role="status">Обновляем доступное время…</p>}
        {unavailable && <div className="notice form-load-status">
          <p>Перед сохранением загрузите актуальное расписание. Данные формы сохранены.</p>
          <button type="button" className="text-button recovery-action" onClick={onRetryLoad}>Обновить расписание</button>
        </div>}
        <div className="form-actions">
          {missing ? <button type="button" className="button button-primary" disabled={busy !== null}
            onClick={() => {
              onContinueAsNew()
              requestAnimationFrame(() => titleRef.current?.focus())
            }}>Продолжить как новую встречу</button> : <button type="submit" className="button button-primary"
            disabled={busy !== null || loading || unavailable || errors.length > 0}>
            {busy === 'save' ? 'Сохранение…' : original ? 'Сохранить изменения' : 'Забронировать'}
          </button>}
          <button type="button" className="button button-secondary" disabled={busy !== null} onClick={onCancel}>Отмена</button>
        </div>
      </form>
      {original && !missing && <div className="delete-area">
        {confirmDelete ? <div role="group" aria-label="Подтверждение удаления">
          <p className="delete-question">Удалить эту встречу?</p>
          <p className="field-hint">Бронирование будет удалено из расписания.</p>
          <div className="delete-actions">
            <button type="button" className="button button-danger" disabled={busy !== null} onClick={onDelete}>
              {busy === 'delete' ? 'Удаление…' : 'Подтвердить удаление'}
            </button>
            <button type="button" className="button button-secondary" disabled={busy !== null}
              autoFocus onClick={() => {
                setConfirmDelete(false)
                requestAnimationFrame(() => deleteRef.current?.focus())
              }}>Оставить встречу</button>
          </div>
        </div> : <button ref={deleteRef} type="button" className="text-button danger-text" disabled={busy !== null}
          onClick={() => setConfirmDelete(true)}>Удалить бронь</button>}
      </div>}
    </section>
  )
}
