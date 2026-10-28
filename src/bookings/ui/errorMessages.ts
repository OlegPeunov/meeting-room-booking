import { ApiError } from '../api/bookingsApi'
import type { BookingValidationError } from '../domain/types'

const messages: Record<BookingValidationError['code'], string> = {
  INVALID_DATE: 'Выберите корректную дату.',
  INVALID_TIME: 'Укажите корректное время начала и окончания.',
  OUTSIDE_WORKING_HOURS: 'Встреча должна проходить с 09:00 до 18:00.',
  INVALID_TIME_STEP: 'Выбирайте время с шагом 30 минут.',
  START_NOT_BEFORE_END: 'Начало должно быть раньше окончания.',
  DURATION_TOO_SHORT: 'Минимальная длительность — 30 минут.',
  DURATION_TOO_LONG: 'Максимальная длительность — 2 часа.',
  START_IN_PAST: 'Время начала уже прошло. Выберите будущий интервал.',
  STARTED_BOOKING_TIME_LOCKED: 'Встреча уже началась. Можно изменить только название.',
  BOOKING_CONFLICT: 'Выбранное время уже занято. Выберите другой интервал.',
}

export function validationMessages(errors: readonly BookingValidationError[]): string[] {
  return [...new Set(errors.map((error) => messages[error.code]))]
}

export function apiErrorMessage(error: unknown, action: 'load' | 'create' | 'save' | 'delete'): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return messages.BOOKING_CONFLICT
    if (error.status === 422) {
      return validationMessages(error.errors).join(' ') || 'Проверьте дату, время и данные встречи.'
    }
    if (error.status === 404 && (action === 'save' || action === 'delete')) {
      return 'Эта бронь больше не существует. Данные формы сохранены. Можно продолжить как новую встречу.'
    }
    if (error.status >= 500 || (error.status === 404 && (action === 'load' || action === 'create'))) {
      if (action === 'load') return 'Расписание временно недоступно. Повторите загрузку.'
      if (error.status === 404) return 'Сервис бронирования временно недоступен. Попробуйте ещё раз.'
      return 'Сервис временно недоступен. Попробуйте ' + (action === 'delete' ? 'удалить бронь' : 'сохранить встречу') + ' ещё раз.'
    }
    return 'Сервер отклонил запрос. Проверьте данные и попробуйте снова.'
  }
  if (error instanceof TypeError) {
    return 'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.'
  }
  return 'Не удалось получить корректный ответ сервера. Попробуйте ещё раз.'
}
