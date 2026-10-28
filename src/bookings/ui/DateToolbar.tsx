import { isValidBookingDate } from '../domain/time'
import { shiftDate } from './dateUtils'

type Props = {
  date: string
  today: string
  disabled: boolean
  onChange: (date: string) => void
}

export function DateToolbar({ date, today, disabled, onChange }: Props) {
  return (
    <section className="date-toolbar" aria-label="Выбор дня">
      <div className="date-controls">
        <button className="icon-button" type="button" aria-label="Предыдущий день"
          disabled={disabled || date === '0001-01-01'} onClick={() => onChange(shiftDate(date, -1))}>←</button>
        <label className="toolbar-date">
          <span>Дата расписания</span>
          <input type="date" value={date} min="0001-01-01" max="9999-12-31" disabled={disabled}
            onChange={(event) => {
              if (isValidBookingDate(event.target.value)) onChange(event.target.value)
            }} />
        </label>
        <button className="icon-button" type="button" aria-label="Следующий день"
          disabled={disabled || date === '9999-12-31'} onClick={() => onChange(shiftDate(date, 1))}>→</button>
        <button className="button button-secondary" type="button" disabled={disabled || date === today}
          onClick={() => onChange(today)}>Сегодня</button>
      </div>
      <p className="toolbar-hint">{disabled ? 'Дату встречи можно изменить в форме' : 'Выберите день и свободное время'}</p>
    </section>
  )
}
