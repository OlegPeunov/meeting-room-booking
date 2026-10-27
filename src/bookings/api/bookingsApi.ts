import type { Booking, BookingInput, BookingValidationError } from '../domain/types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: BookingValidationError[]

  constructor(status: number, code: string, errors: BookingValidationError[] = []) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.errors = errors
  }
}

export function createBookingsApi(baseUrl = '/api') {
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(baseUrl + path, options)
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      let code = 'HTTP_ERROR'
      let errors: BookingValidationError[] = []
      if (typeof body === 'object' && body !== null) {
        if ('code' in body && typeof body.code === 'string') code = body.code
        if ('errors' in body && Array.isArray(body.errors)) errors = body.errors
      }
      throw new ApiError(response.status, code, errors)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  return {
    list: (date: string, signal?: AbortSignal) => request<Booking[]>(
      '/bookings?' + new URLSearchParams({ date }), { signal },
    ),
    create: (input: BookingInput) => request<Booking>('/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
    update: (id: string, changes: Partial<BookingInput>) => request<Booking>(
      '/bookings/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      },
    ),
    remove: (id: string) => request<void>('/bookings/' + encodeURIComponent(id), {
      method: 'DELETE',
    }),
  }
}

export const bookingsApi = createBookingsApi()
