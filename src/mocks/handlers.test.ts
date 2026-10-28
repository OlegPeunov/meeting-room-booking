import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import type { Booking, BookingInput } from '../bookings/domain/types'
import { createHandlers } from './handlers'
import { createBookingStore, STORAGE_KEY } from './store'

const server = setupServer()
const endpoint = 'http://localhost/api/bookings'
const input: BookingInput = {
  date: '2026-10-28', start: '09:00', end: '09:30', title: 'My meeting',
}
let current: Date
let store: ReturnType<typeof createBookingStore>
const clock = () => current

function send(method: string, body?: unknown, id?: string) {
  return fetch(endpoint + (id ? '/' + id : ''), {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
function list(date = input.date) {
  return fetch(endpoint + '?date=' + date)
}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())
beforeEach(() => {
  current = new Date(2026, 9, 27, 8, 0)
  store = createBookingStore({ now: clock })
  server.use(...createHandlers(store, { now: clock }))
})

describe('HTTP handlers', () => {
  it('supports CRUD with 201, 200, 204 and moves between dates', async () => {
    const createdResponse = await send('POST', input)
    expect(createdResponse.status).toBe(201)
    const created: Booking = await createdResponse.json()
    expect(created).toEqual({ ...input, id: expect.any(String) })
    const response = await list()
    expect(response.status).toBe(200)
    expect(await response.json()).toContainEqual(created)
    const updatedResponse = await send('PATCH', { date: '2026-10-30', title: 'Moved' }, created.id)
    expect(updatedResponse.status).toBe(200)
    const updated = await updatedResponse.json()
    expect(updated).toEqual({ ...created, date: '2026-10-30', title: 'Moved' })
    expect(await (await list()).json()).not.toContainEqual(created)
    expect(await (await list('2026-10-30')).json()).toEqual([updated])
    const deleted = await send('DELETE', undefined, created.id)
    expect(deleted.status).toBe(204)
    expect(await deleted.text()).toBe('')
    expect(await (await list('2026-10-30')).json()).toEqual([])
  })

  it('returns only the chosen date sorted by start', async () => {
    expect(await (await list('2026-10-27')).json()).toEqual([])
    const response: Booking[] = await (await list()).json()
    expect(response.map((row) => row.start)).toEqual(['10:00', '14:00'])
  })

  it.each(['', 'not-a-date', '2026-02-30'])('validates GET date %j', async (date) => {
    const response = await list(date)
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      code: 'VALIDATION_ERROR', errors: [{ code: 'INVALID_DATE', field: 'date' }],
    })
  })

  it.each([null, [], {}, { ...input, title: 42 }, { ...input, start: 900 }])(
    'rejects invalid request shape %j', async (body) => {
      const response = await send('POST', body)
      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({ code: 'INVALID_REQUEST' })
    },
  )

  it('rejects malformed JSON', async () => {
    expect((await fetch(endpoint, { method: 'POST', body: '{broken' })).status).toBe(422)
  })

  it.each([
    [{ date: '2026-02-30' }, 'INVALID_DATE'],
    [{ start: '08:30' }, 'OUTSIDE_WORKING_HOURS'],
    [{ start: '09:15' }, 'INVALID_TIME_STEP'],
    [{ end: '09:15' }, 'DURATION_TOO_SHORT'],
    [{ end: '11:30' }, 'DURATION_TOO_LONG'],
    [{ start: '09:30' }, 'START_NOT_BEFORE_END'],
    [{ date: '2026-10-26' }, 'START_IN_PAST'],
  ])('validates POST independently of the UI: %j', async (changes, code) => {
    const before = store.getAll()
    const response = await send('POST', { ...input, ...changes })
    expect(response.status).toBe(422)
    expect((await response.json()).errors).toContainEqual(expect.objectContaining({ code }))
    expect(store.getAll()).toEqual(before)
  })

  it.each(['PATCH', 'DELETE'])('returns 404 for missing %s target', async (method) => {
    const response = await send(method, method === 'PATCH' ? { title: 'X' } : undefined, 'missing')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: 'BOOKING_NOT_FOUND' })
  })

  it('rejects changing identity or sending invalid fields through PATCH', async () => {
    for (const patch of [{ id: 'new-id' }, { start: null }, { title: 1 }]) {
      expect((await send('PATCH', patch, 'demo-planning')).status).toBe(422)
    }
  })

  it('excludes the current booking while still checking other bookings on PATCH', async () => {
    expect((await send('PATCH', { title: 'Renamed' }, 'demo-planning')).status).toBe(200)
    const before = store.getAll()
    const response = await send('PATCH', { start: '14:00', end: '15:00' }, 'demo-planning')
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('BOOKING_CONFLICT')
    expect(store.getAll()).toEqual(before)
  })

  it('checks time rules on PATCH as well as POST', async () => {
    const response = await send('PATCH', { start: '08:00' }, 'demo-planning')
    expect(response.status).toBe(422)
    expect((await response.json()).errors)
      .toContainEqual({ code: 'OUTSIDE_WORKING_HOURS', field: 'start' })
  })

  it('allows a past title-only edit but locks its schedule; deletion remains available', async () => {
    current = new Date(2026, 9, 30, 12)
    const response = await send('PATCH', { title: 'Past meeting' }, 'demo-planning')
    expect(response.status).toBe(200)
    expect((await response.json()).title).toBe('Past meeting')
    const locked = await send('PATCH', { date: '2026-10-31' }, 'demo-planning')
    expect(locked.status).toBe(422)
    expect((await locked.json()).errors).toContainEqual({ code: 'STARTED_BOOKING_TIME_LOCKED' })
    expect((await send('DELETE', undefined, 'demo-planning')).status).toBe(204)
  })

  it('returns a natural overlap conflict without altering the store', async () => {
    const before = store.getAll()
    const response = await send('POST', { ...input, start: '10:30', end: '11:30' })
    expect(response.status).toBe(409)
    expect(store.getAll()).toEqual(before)
  })

  it('makes the conflict scenario one-shot and exposes the competing booking on GET', async () => {
    server.resetHandlers(...createHandlers(store, { now: clock, scenario: 'conflict' }))
    expect((await send('POST', { ...input, start: '08:00' })).status).toBe(422)
    // An existing overlap also does not consume the scenario.
    expect((await send('POST', { ...input, start: '10:00', end: '11:00' })).status).toBe(409)
    const response = await send('POST', input)
    expect(response.status).toBe(409)
    const rows: Booking[] = await (await list()).json()
    const competing = rows.find((row) => row.start === input.start)
    expect(competing).toMatchObject({ ...input, title: 'Конкурирующая встреча' })
    expect((await response.json()).errors).toContainEqual({
      code: 'BOOKING_CONFLICT', bookingIds: [competing?.id],
    })
    expect((await send('POST', input)).status).toBe(409)
    expect(store.getAll()).toHaveLength(4)
    expect((await send('POST', { ...input, start: '11:00', end: '11:30' })).status).toBe(201)
    expect((await fetch('http://localhost/api/demo/reset', { method: 'POST' })).status).toBe(204)
    expect(store.getAll()).toHaveLength(3)
    expect((await send('POST', input)).status).toBe(409)
  })

  it('allows only one of two concurrent creates for the same interval', async () => {
    const responses = await Promise.all([send('POST', input), send('POST', input)])
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409])
    expect(store.getAll().filter((row) => row.start === input.start)).toHaveLength(1)
  })

  it('retains HTTP writes and simulated conflicts after rebuilding the store and handlers', async () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    store = createBookingStore({ storage, now: clock })
    server.resetHandlers(...createHandlers(store, { now: clock, scenario: 'conflict' }))
    expect((await send('POST', input)).status).toBe(409)
    expect((await send('POST', { ...input, start: '11:00', end: '11:30' })).status).toBe(201)
    const before = await (await list()).json()
    store = createBookingStore({ storage, now: clock })
    server.resetHandlers(...createHandlers(store, { now: clock }))
    expect(await (await list()).json()).toEqual(before)
  })

  it.each(['http://localhost:5173', 'http://127.0.0.1:5173'])(
    'updates and deletes a persisted generated-ID booking at %s', async (origin) => {
      const values = new Map<string, string>()
      const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
      }
      const install = () => {
        store = createBookingStore({ storage, now: clock })
        server.resetHandlers(...createHandlers(store, { now: clock }))
      }
      const url = origin + '/api/bookings'
      const body = { date: '2026-10-29', start: '10:00', end: '11:00', title: 'Before reload' }
      install()
      const createdResponse = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      expect(createdResponse.status).toBe(201)
      const created: Booking = await createdResponse.json()
      const originalRows = store.getAll().filter((row) => row.id !== created.id)
      // A page reload reconstructs the mock store from the same sessionStorage data.
      install()
      const changed = { ...body, start: '14:00', end: '15:00', title: 'After reload' }
      const updated = await fetch(url + '/' + encodeURIComponent(created.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changed),
      })
      expect(updated.status).toBe(200)
      expect(await updated.json()).toEqual({ ...changed, id: created.id })
      install()
      expect(store.getAll()).toContainEqual({ ...changed, id: created.id })
      const beforeConflict = storage.getItem(STORAGE_KEY)
      const conflict = await fetch(url + '/' + created.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...changed, start: '11:00', end: '12:00' }),
      })
      expect(conflict.status).toBe(409)
      expect(storage.getItem(STORAGE_KEY)).toBe(beforeConflict)
      const deleted = await fetch(url + '/' + created.id, { method: 'DELETE' })
      expect(deleted.status).toBe(204)
      expect(await deleted.text()).toBe('')
      install()
      expect(store.getAll()).toEqual(originalRows)
    },
  )


  it('fails the first valid GET in load-error mode and recovers on retry without changing data', async () => {
    server.resetHandlers(...createHandlers(store, { now: clock, scenario: 'load-error' }))
    const before = store.getAll()
    expect((await list('invalid')).status).toBe(422)
    expect((await list()).status).toBe(503)
    expect((await list()).status).toBe(200)
    expect(store.getAll()).toEqual(before)
  })

  it.each(['POST', 'PATCH'])('fails one valid %s in save-error mode without persisting it', async (method) => {
    server.resetHandlers(...createHandlers(store, { now: clock, scenario: 'save-error' }))
    const id = method === 'PATCH' ? 'demo-planning' : undefined
    const body = method === 'PATCH' ? { title: 'Updated' } : input
    const before = store.getAll()
    expect((await send(method, body, id)).status).toBe(503)
    expect(store.getAll()).toEqual(before)
    expect((await send(method, body, id)).status).toBe(method === 'PATCH' ? 200 : 201)
  })

})
