function App() {
  return (
    <main className="page">
      <header className="page-header">
        <p className="eyebrow">Переговорная комната</p>
        <h1>Meeting Room Booking</h1>
        <p className="page-description">Пространство для ваших встреч.</p>
      </header>

      <section className="room-panel" aria-labelledby="schedule-heading">
        <div>
          <h2 id="schedule-heading">Расписание встреч</h2>
          <p className="muted">
            Здесь появится расписание и возможность забронировать комнату.
          </p>
        </div>
        <dl className="room-details">
          <div>
            <dt>Рабочий день</dt>
            <dd>09:00–18:00</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}

export default App
