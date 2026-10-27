import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw/http'
import { setupServer } from 'msw/node'
import { createHandlers } from '../../mocks/handlers'
import { createBookingStore } from '../../mocks/store'
import { ApiError, createBookingsApi } from './bookingsApi'

const server = setupServer()
const api = createBookingsApi('http://localhost/api')
const input = { date: '2026-10-28', start: '09:00', end: '09:30', title: 'Client meeting' }
const now = () => new Date(2026, 9, 27, 8)
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())
beforeEach(() => server.use(...createHandlers(createBookingStore({ now }), { now })))

describe('fetch API client', () => {
  it('reads, creates, partially updates and deletes via the actual mock handlers', async () => {
    const before = await api.list(input.date)
    const created = await api.create(input)
    expect(created).toEqual({ ...input, id: expect.any(String) })
    expect(await api.list(input.date)).toHaveLength(before.length + 1)
    expect(await api.update(created.id, { title: 'Updated' })).toEqual({ ...created, title: 'Updated' })
    await expect(api.remove(created.id)).resolves.toBeUndefined()
    expect(await api.list(input.date)).toEqual(before)
  })

  it('preserves structured validation errors and HTTP status', async () => {
    await expect(api.create({ ...input, date: '2026-10-26' })).rejects.toMatchObject({
      name: 'ApiError', status: 422, code: 'VALIDATION_ERROR', errors: [{ code: 'START_IN_PAST' }],
    })
  })

  it('exposes 409 and lets the caller refresh the authoritative list', async () => {
    server.resetHandlers(...createHandlers(createBookingStore({ now }), { now, scenario: 'conflict' }))
    await expect(api.create(input)).rejects.toMatchObject({ status: 409, code: 'BOOKING_CONFLICT' })
    expect(await api.list(input.date)).toContainEqual(expect.objectContaining({
      start: input.start, end: input.end, title: 'Конкурирующая встреча',
    }))
  })

  it('preserves a 404 as an ApiError', async () => {
    const result = api.update('missing', { title: 'X' })
    await expect(result).rejects.toBeInstanceOf(ApiError)
    await expect(result).rejects.toMatchObject({ status: 404, code: 'BOOKING_NOT_FOUND' })
  })

  it('handles a non-JSON HTTP error without losing its status', async () => {
    server.use(http.get('*/api/bookings', () => new HttpResponse('<html>Error</html>', { status: 503 })))
    await expect(api.list(input.date)).rejects.toMatchObject({ status: 503, code: 'HTTP_ERROR', errors: [] })
  })

  it('passes through a network failure', async () => {
    server.use(http.get('*/api/bookings', () => HttpResponse.error()))
    await expect(api.list(input.date)).rejects.toBeInstanceOf(TypeError)
  })

  it('supports aborting a list request', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(api.list(input.date, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('encodes a route ID instead of treating it as additional path segments', async () => {
    server.use(http.patch('*/api/bookings/:id', ({ request, params }) => {
      expect(request.url.endsWith('/room%2F1')).toBe(true)
      expect(params.id).toBe('room/1')
      return HttpResponse.json({ ...input, id: 'room/1' })
    }))
    expect((await api.update('room/1', { title: 'X' })).id).toBe('room/1')
  })
})
