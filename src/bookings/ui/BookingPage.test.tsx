// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw/http'
import { setupServer } from 'msw/node'
import { bookingsApi } from '../api/bookingsApi'
import type { Booking } from '../domain/types'
import { createHandlers } from '../../mocks/handlers'
import { createBookingStore } from '../../mocks/store'
import { BookingPage } from './BookingPage'

const server = setupServer()
const TODAY = '2026-10-28'
// The regular tests freeze Date without advancing timers. Stay off an exact slot boundary.
const NOW = new Date(2026, 9, 28, 8, 0, 1)
let interceptedFetch: typeof fetch
let store: ReturnType<typeof createBookingStore>

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
  interceptedFetch = globalThis.fetch
  Object.defineProperty(window, 'matchMedia', {
    configurable: true, value: () => ({ matches: false }),
  })
})
afterAll(() => server.close())
beforeEach(() => {
  vi.setSystemTime(NOW)
  // jsdom has no browser fetch URL resolution. Keep real fetch + MSW interception,
  // and only resolve relative URLs as a browser would.
  const browserFetch: typeof fetch = (input, options) => interceptedFetch(
    typeof input === 'string' ? new URL(input, window.location.href) : input, options,
  )
  vi.stubGlobal('fetch', browserFetch)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  store = createBookingStore()
  server.use(...createHandlers(store))
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function openDraft(title = 'Design sync') {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Забронировать 09:00–09:30' }))
  await user.type(screen.getByLabelText(/Название встречи/), title)
  return user
}

function expectDraft(date = TODAY, title = 'Design sync', start = '09:00', end = '09:30') {
  expect(screen.getByLabelText('Дата встречи')).toHaveValue(date)
  expect(screen.getByLabelText('Начало')).toHaveValue(start)
  expect(screen.getByLabelText('Окончание')).toHaveValue(end)
  expect(screen.getByLabelText(/Название встречи/)).toHaveValue(title)
}

function seedEditable(): Booking {
  const booking = { id: 'editable', date: TODAY, start: '09:00', end: '10:00', title: 'Existing' }
  store.save(booking)
  return booking
}

describe('booking page integration through fetch and MSW', () => {
  it('does not dispatch GET from the effect disposed by StrictMode', async () => {
    const get = vi.spyOn(bookingsApi, 'list')
    render(<StrictMode><BookingPage /></StrictMode>)
    expect(await screen.findByText('В этот день встреч пока нет.')).toBeVisible()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('shows loading before an empty schedule and prevents creating from unconfirmed data', async () => {
    const pending = gate()
    server.use(http.get('*/api/bookings', async () => {
      await pending.promise
      return HttpResponse.json([])
    }))
    render(<StrictMode><BookingPage /></StrictMode>)
    expect(screen.getByText('Загрузка расписания…')).toBeVisible()
    expect(screen.queryByText('В этот день встреч пока нет.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Загрузка… 09:00–09:30' })).toBeDisabled()
    pending.resolve()
    expect(await screen.findByText('В этот день встреч пока нет.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Забронировать 09:00–09:30' })).toBeEnabled()
  })

  it('recovers from an initial load failure on explicit retry', async () => {
    server.resetHandlers(...createHandlers(store, { scenario: 'load-error' }))
    render(<StrictMode><BookingPage /></StrictMode>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Расписание временно недоступно.')
    expect(screen.getByRole('button', { name: 'Нет актуальных данных 09:00–09:30' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    expect(await screen.findByText('В этот день встреч пока нет.')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('creates, renames and deletes a meeting using the actual API', async () => {
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.selectOptions(screen.getByLabelText('Окончание'), '10:00')
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Design sync, 09:00–10:00' }))
    await user.clear(screen.getByLabelText(/Название встречи/))
    await user.type(screen.getByLabelText(/Название встречи/), 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Renamed, 09:00–10:00' }))
    await user.click(screen.getByRole('button', { name: 'Удалить бронь' }))
    expect(store.getAll().some((booking) => booking.title === 'Renamed')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
    expect(await screen.findByText('Бронирование удалено.')).toBeVisible()
    expect(await screen.findByText('В этот день встреч пока нет.')).toBeVisible()
    expect(store.getAll().some((booking) => booking.title === 'Renamed')).toBe(false)
  })

  it('handles POST → 409 → refreshed list without losing any draft fields or resubmitting', async () => {
    server.resetHandlers(...createHandlers(store, { scenario: 'conflict' }))
    const post = vi.spyOn(bookingsApi, 'create')
    const get = vi.spyOn(bookingsApi, 'list')
    render(<StrictMode><BookingPage /></StrictMode>)
    fireEvent.change(screen.getByLabelText('Дата расписания'), { target: { value: '2026-10-29' } })
    const user = await openDraft()
    const loadsBeforeSave = get.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Выбранное время уже занято.')
    expect(await screen.findByRole('button', { name: 'Редактировать: Конкурирующая встреча, 09:00–09:30' })).toBeVisible()
    expectDraft('2026-10-29')
    expect(get.mock.calls.length).toBeGreaterThan(loadsBeforeSave)
    expect(post).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Забронировать' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Начало'), '09:30')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('button', { name: 'Редактировать: Design sync, 09:30–10:00' })).toBeVisible()
    expect(post).toHaveBeenCalledTimes(2)
    expect(store.getAll().filter((booking) => booking.title === 'Design sync')).toHaveLength(1)
  })

  it('keeps the draft and blocks saving if refresh after 409 fails; reload can be retried', async () => {
    server.resetHandlers(...createHandlers(store, { scenario: 'conflict' }))
    let failRead = false
    server.use(
      http.post('*/api/bookings', () => { failRead = true }),
      http.get('*/api/bookings', () => {
        if (failRead) {
          failRead = false
          return new HttpResponse(null, { status: 503 })
        }
      }),
    )
    const post = vi.spyOn(bookingsApi, 'create')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByText('Расписание временно недоступно. Повторите загрузку.')).toBeVisible()
    expectDraft()
    expect(screen.getByRole('button', { name: 'Забронировать' })).toBeDisabled()
    expect(post).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Обновить расписание' }))
    expect(await screen.findByRole('button', { name: 'Редактировать: Конкурирующая встреча, 09:00–09:30' })).toBeVisible()
    expectDraft()
    expect(post).toHaveBeenCalledTimes(1)
    await user.selectOptions(screen.getByLabelText('Начало'), '09:30')
    expect(screen.getByRole('button', { name: 'Забронировать' })).toBeEnabled()
  })

  it.each(['server', 'network'] as const)('preserves fields on %s save error and only retries on a click', async (failure) => {
    let failOnce = true
    server.use(http.post('*/api/bookings', () => {
      if (failOnce) {
        failOnce = false
        return failure === 'network' ? HttpResponse.error() : new HttpResponse(null, { status: 503 })
      }
    }))
    const post = vi.spyOn(bookingsApi, 'create')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'network'
      ? 'Не удалось связаться с сервером.' : 'Сервис временно недоступен.')
    expectDraft()
    expect(post).toHaveBeenCalledTimes(1)
    expect(store.getAll().some((booking) => booking.title === 'Design sync')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('button', { name: 'Редактировать: Design sync, 09:00–09:30' })).toBeVisible()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('shows domain details returned with 422 and preserves the draft', async () => {
    server.use(http.post('*/api/bookings', () => HttpResponse.json({
      code: 'VALIDATION_ERROR', errors: [{ code: 'START_IN_PAST' }],
    }, { status: 422 })))
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Время начала уже прошло.')
    expectDraft()
  })

  it('preserves an edit draft after 404 and requires explicit conversion before creating a new booking', async () => {
    const original = seedEditable()
    const post = vi.spyOn(bookingsApi, 'create')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Existing, 09:00–10:00' }))
    await user.clear(screen.getByLabelText(/Название встречи/))
    await user.type(screen.getByLabelText(/Название встречи/), 'Recovered draft')
    store.remove(original.id)
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Эта бронь больше не существует.')
    expectDraft(TODAY, 'Recovered draft', '09:00', '10:00')
    expect(post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Продолжить как новую встречу' }))
    expectDraft(TODAY, 'Recovered draft', '09:00', '10:00')
    expect(post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('button', { name: 'Редактировать: Recovered draft, 09:00–10:00' })).toBeVisible()
    expect(post).toHaveBeenCalledTimes(1)
    expect(store.getAll().find((booking) => booking.title === 'Recovered draft')?.id).not.toBe(original.id)
  })

  it('treats a POST 404 as an unavailable endpoint, without converting a create draft into an edit recovery', async () => {
    server.use(http.post('*/api/bookings', () => new HttpResponse(null, { status: 404 })))
    const post = vi.spyOn(bookingsApi, 'create')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис бронирования временно недоступен.')
    expectDraft()
    expect(screen.queryByRole('button', { name: 'Продолжить как новую встречу' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Забронировать' })).toBeEnabled()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('keeps delete confirmation after a server error and allows an explicit retry', async () => {
    seedEditable()
    let failOnce = true
    server.use(http.delete('*/api/bookings/:id', () => {
      if (failOnce) { failOnce = false; return new HttpResponse(null, { status: 503 }) }
    }))
    const remove = vi.spyOn(bookingsApi, 'remove')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Existing, 09:00–10:00' }))
    await user.click(screen.getByRole('button', { name: 'Удалить бронь' }))
    await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Попробуйте удалить бронь ещё раз.')
    expect(screen.getByLabelText(/Название встречи/)).toHaveValue('Existing')
    expect(remove).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
    expect(await screen.findByText('Бронирование удалено.')).toBeVisible()
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it('handles an already-deleted booking without presenting deletion as a failure', async () => {
    const original = seedEditable()
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Existing, 09:00–10:00' }))
    store.remove(original.id)
    await user.click(screen.getByRole('button', { name: 'Удалить бронь' }))
    await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
    expect(await screen.findByText('Встреча уже удалена. Расписание обновляется.')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Дата встречи')).not.toBeInTheDocument()
  })

  it('does not misreport a successful save as failed if its following GET fails', async () => {
    let failRead = false
    server.use(
      http.post('*/api/bookings', () => { failRead = true }),
      http.get('*/api/bookings', () => {
        if (failRead) { failRead = false; return new HttpResponse(null, { status: 503 }) }
      }),
    )
    const post = vi.spyOn(bookingsApi, 'create')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByText('Встреча забронирована.')).toBeVisible()
    expect(await screen.findByRole('alert')).toHaveTextContent('Расписание временно недоступно.')
    expect(screen.queryByLabelText('Дата встречи')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    expect(await screen.findByRole('button', { name: 'Редактировать: Design sync, 09:00–09:30' })).toBeVisible()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failure'])('ignores a late %s from an earlier date after rapid date switches', async (result) => {
    const pending = gate()
    const started = gate()
    const finished = gate()
    server.use(http.get('*/api/bookings', async ({ request }) => {
      if (new URL(request.url).searchParams.get('date') === '2026-10-29') {
        started.resolve()
        await pending.promise
        finished.resolve()
        if (result === 'failure') return new HttpResponse(null, { status: 503 })
        return HttpResponse.json([{ id: 'stale', date: '2026-10-29', start: '09:00', end: '10:00', title: 'Stale response' }])
      }
    }))
    render(<StrictMode><BookingPage /></StrictMode>)
    await screen.findByText('В этот день встреч пока нет.')
    fireEvent.change(screen.getByLabelText('Дата расписания'), { target: { value: '2026-10-29' } })
    await started.promise
    fireEvent.change(screen.getByLabelText('Дата расписания'), { target: { value: '2026-10-30' } })
    expect(await screen.findByRole('button', { name: 'Редактировать: Обсуждение проекта, 11:00–12:00' })).toBeVisible()
    await act(async () => { pending.resolve(); await finished.promise })
    expect(screen.getByLabelText('Дата расписания')).toHaveValue('2026-10-30')
    expect(screen.getByRole('heading', { name: /30 октября/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Редактировать: Stale response/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('prevents duplicate submission while a save is pending', async () => {
    const pending = gate()
    const started = gate()
    server.use(http.post('*/api/bookings', async () => { started.resolve(); await pending.promise }))
    const post = vi.spyOn(bookingsApi, 'create')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.dblClick(screen.getByRole('button', { name: 'Забронировать' }))
    await started.promise
    expect(screen.getByRole('button', { name: 'Сохранение…' })).toBeDisabled()
    expect(screen.getByLabelText(/Название встречи/)).toBeDisabled()
    expect(post).toHaveBeenCalledTimes(1)
    pending.resolve()
    expect(await screen.findByRole('button', { name: 'Редактировать: Design sync, 09:00–09:30' })).toBeVisible()
  })

  it('preserves an edit draft after PATCH 409 and accepts a manually selected replacement interval', async () => {
    seedEditable()
    const patch = vi.spyOn(bookingsApi, 'update')
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Existing, 09:00–10:00' }))
    await user.selectOptions(screen.getByLabelText('Начало'), '11:00')
    await user.clear(screen.getByLabelText(/Название встречи/))
    await user.type(screen.getByLabelText(/Название встречи/), 'Moved draft')
    store.save({ id: 'rival', date: TODAY, start: '11:00', end: '12:00', title: 'Other meeting' })
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Выбранное время уже занято.')
    expect(await screen.findByRole('button', { name: 'Редактировать: Other meeting, 11:00–12:00' })).toBeVisible()
    expectDraft(TODAY, 'Moved draft', '11:00', '12:00')
    expect(patch).toHaveBeenCalledTimes(1)
    await user.selectOptions(screen.getByLabelText('Начало'), '13:00')
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    expect(await screen.findByRole('button', { name: 'Редактировать: Moved draft, 13:00–14:00' })).toBeVisible()
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it('can restore the original interval without losing the title when a booking starts during editing', async () => {
    seedEditable()
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Existing, 09:00–10:00' }))
    await user.selectOptions(screen.getByLabelText('Начало'), '11:00')
    await user.clear(screen.getByLabelText(/Название встречи/))
    await user.type(screen.getByLabelText(/Название встречи/), 'Title survives')
    vi.setSystemTime(new Date(2026, 9, 28, 9, 5))
    fireEvent.focus(window)
    expect(screen.getByLabelText('Начало')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Вернуть исходное время' }))
    expectDraft(TODAY, 'Title survives', '09:00', '10:00')
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    expect(await screen.findByText('Изменения сохранены.')).toBeVisible()
    expect(store.getAll()).toContainEqual(expect.objectContaining({ id: 'editable', title: 'Title survives', start: '09:00' }))
  })

  it('marks a slot as past as soon as its start time passes', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 28, 8, 59, 59))
    vi.spyOn(bookingsApi, 'list').mockResolvedValue([])
    render(<StrictMode><BookingPage /></StrictMode>)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Забронировать 09:00–09:30' })).toBeEnabled()
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByRole('button', { name: 'Прошедшее время 09:00–09:30' })).toBeDisabled()
  })

  it('locks a booking as it starts and keeps title editing available after it ends', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 28, 8, 59, 59))
    const original = { id: 'boundary', date: TODAY, start: '09:00', end: '09:30', title: 'Boundary meeting' }
    vi.spyOn(bookingsApi, 'list').mockResolvedValue([original])
    render(<StrictMode><BookingPage /></StrictMode>)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать: Boundary meeting, 09:00–09:30' }))
    expect(screen.getByLabelText('Начало')).toBeEnabled()
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByLabelText('Начало')).toBeDisabled()
    expect(screen.getByLabelText('Окончание')).toBeDisabled()
    expect(screen.getByLabelText('Дата встречи')).toBeDisabled()
    expect(screen.getByLabelText(/Название встречи/)).toBeEnabled()
    await act(async () => { vi.advanceTimersByTime(30 * 60_000) })
    expect(screen.getByText('09:00–09:30 · Завершена')).toBeVisible()
    expect(screen.getByLabelText(/Название встречи/)).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeEnabled()
  })

  it('moves keyboard focus to the form error so retry stays within the form', async () => {
    server.resetHandlers(...createHandlers(store, { scenario: 'save-error' }))
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = await openDraft()
    await user.click(screen.getByRole('button', { name: 'Забронировать' }))
    expect(await screen.findByRole('alert')).toHaveFocus()
    expectDraft()
  })

  it('allows title changes and deletion of a completed booking while locking its schedule', async () => {
    seedEditable()
    vi.setSystemTime(new Date(2026, 9, 28, 10, 5))
    render(<StrictMode><BookingPage /></StrictMode>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Existing, 09:00–10:00' }))
    expect(screen.getByLabelText('Дата встречи')).toBeDisabled()
    expect(screen.getByLabelText('Начало')).toBeDisabled()
    expect(screen.getByLabelText('Окончание')).toBeDisabled()
    await user.clear(screen.getByLabelText(/Название встречи/))
    await user.type(screen.getByLabelText(/Название встречи/), 'Completed meeting')
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }))
    await user.click(await screen.findByRole('button', { name: 'Редактировать: Completed meeting, 09:00–10:00' }))
    expect(store.getAll().find((booking) => booking.id === 'editable')).toEqual(expect.objectContaining({ start: '09:00', end: '10:00', title: 'Completed meeting' }))
    await user.click(screen.getByRole('button', { name: 'Удалить бронь' }))
    await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
    expect(await screen.findByText('Бронирование удалено.')).toBeVisible()
    expect(store.getAll().find((booking) => booking.id === 'editable')).toBeUndefined()
  })
})
