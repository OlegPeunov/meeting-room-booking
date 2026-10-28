import { useCallback, useEffect, useState } from 'react'
import { bookingsApi } from '../api/bookingsApi'
import type { Booking } from '../domain/types'
import { apiErrorMessage } from './errorMessages'

type LoadState = {
  date: string
  revision: number
  bookings: Booking[]
  error: string | null
}

export function useBookings(date: string) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<LoadState>({
    date: '', revision: -1, bookings: [], error: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    // StrictMode disposes its first effect synchronously. Do not send that obsolete request.
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      void bookingsApi.list(date, controller.signal).then((bookings) => {
        if (!controller.signal.aborted) setState({ date, revision, bookings, error: null })
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setState((previous) => ({
          date, revision,
          bookings: previous.date === date ? previous.bookings : [],
          error: apiErrorMessage(error, 'load'),
        }))
      })
    })
    return () => controller.abort()
  }, [date, revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const loading = state.date !== date || state.revision !== revision
  return {
    bookings: state.date === date ? state.bookings : [],
    loading,
    refreshing: loading && state.date === date,
    error: loading ? null : state.error,
    reload,
  }
}
