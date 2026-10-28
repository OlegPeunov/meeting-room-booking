import { useCallback, useEffect, useState } from 'react'
import { bookingsApi } from '../api/bookingsApi'
import type { Booking } from '../domain/types'

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
    void bookingsApi.list(date, controller.signal).then((bookings) => {
      if (!controller.signal.aborted) setState({ date, revision, bookings, error: null })
    }).catch(() => {
      if (!controller.signal.aborted) setState({
        date, revision, bookings: [], error: 'Не удалось загрузить расписание. Попробуйте ещё раз.',
      })
    })
    return () => controller.abort()
  }, [date, revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const loading = state.date !== date || state.revision !== revision
  return {
    bookings: state.date === date ? state.bookings : [],
    loading,
    error: loading ? null : state.error,
    reload,
  }
}
