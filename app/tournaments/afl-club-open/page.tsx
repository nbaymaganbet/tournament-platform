export default function TournamentPage() {
  return (
    <main>
      <header className="topbar"><div className="container topbar-inner"><a className="brand" href="/">Tournament Platform</a><div className="actions"><button className="lang">ҚАЗ</button><button className="primary">Войти</button></div></div></header>
      <div className="container">
        <section className="hero">
          <div className="eyebrow">MMA · АСТАНА</div>
          <h1>AFL ASTANA FIGHT LEAGUE — CLUB OPEN</h1>
          <p>Клубный турнир по правилам смешанных единоборств. Без ударов в голову.</p>
          <span className="status">Регистрация открыта</span>
        </section>
        <section className="cards">
          <article className="card"><div className="card-body"><h3>Информация</h3><div className="meta">25 сентября 2026<br />Астана<br />MMA<br />Регистрация до 24 сентября</div><button className="primary" style={{ marginTop: 16 }}>Зарегистрироваться</button></div></article>
          <article className="card"><div className="card-body"><h3>Расписание</h3><div className="meta">Расписание появится после публикации организатором.</div></div></article>
          <article className="card"><div className="card-body"><h3>Сетки</h3><div className="meta">Турнирные сетки появятся после формирования категорий.</div></div></article>
          <article className="card"><div className="card-body"><h3>Результаты</h3><div className="meta">Результаты будут доступны после завершения категорий.</div></div></article>
        </section>
      </div>
    </main>
  );
}
