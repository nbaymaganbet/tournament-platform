"use client";

import { useEffect, useState } from "react";

const introSlides = [
  {
    title: "Что это",
    text: "Tournament Platform помогает организаторам провести спортивное соревнование в одном месте.",
    items: ["Создать турнир", "Зарегистрировать участников", "Сформировать категории и сетки", "Провести соревнования и сохранить результаты"],
  },
  {
    title: "Как работает",
    text: "Простой рабочий цикл без лишней сложности.",
    items: ["Создайте → зарегистрируйте → сформируйте → проведите", "Заявки собираются в системе", "Категории, сетки и расписание управляются организатором", "Результаты сохраняются и обновляются для зрителей"],
  },
  {
    title: "Для кого",
    text: "Для организаторов спортивных соревнований: MMA, борьбы, BJJ, грэпплинга, каратэ и других дисциплин с турнирной системой.",
    items: [],
  },
];

const tournaments = [
  { name: "AFL ASTANA FIGHT LEAGUE — CLUB OPEN", date: "25 сентября 2026", city: "Астана", sport: "MMA", status: "Регистрация открыта" },
];

export default function Home() {
  const [showIntro, setShowIntro] = useState(false);
  const [slide, setSlide] = useState(0);
  const [lang, setLang] = useState<"ru" | "kk">("ru");

  useEffect(() => {
    setShowIntro(localStorage.getItem("tp-intro-seen") !== "1");
  }, []);

  function finishIntro() {
    localStorage.setItem("tp-intro-seen", "1");
    setShowIntro(false);
  }

  if (showIntro) {
    const current = introSlides[slide];
    return (
      <main className="intro">
        <section className="intro-card" aria-label="Презентация Tournament Platform">
          <div className="intro-step">TOURNAMENT PLATFORM · {slide + 1}/{introSlides.length}</div>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
          {current.items.length > 0 && <ul className="intro-list">{current.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          <div className="intro-actions">
            {slide > 0 && <button className="secondary" onClick={() => setSlide(slide - 1)}>Назад</button>}
            {slide < introSlides.length - 1 ? (
              <button className="primary" onClick={() => setSlide(slide + 1)}>Далее</button>
            ) : (
              <button className="primary" onClick={finishIntro}>Начать</button>
            )}
            <button className="secondary" onClick={finishIntro}>Пропустить</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <div className="container topbar-inner">
          <a className="brand" href="/">Tournament Platform</a>
          <div className="actions">
            <button className="lang" onClick={() => setLang(lang === "ru" ? "kk" : "ru")}>{lang === "ru" ? "ҚАЗ" : "РУС"}</button>
            <button className="primary">Войти</button>
          </div>
        </div>
      </header>

      <div className="container">
        <section className="hero">
          <div className="eyebrow">СПОРТИВНЫЕ СОРЕВНОВАНИЯ</div>
          <h1>Проведение турнира — в одном месте.</h1>
          <p>Создание соревнования, регистрация участников, категории, сетки, расписание, проведение боёв и результаты.</p>
        </section>

        <section>
          <div className="filters">
            <input className="field" placeholder="Поиск соревнований" />
            <select className="field" defaultValue=""><option value="">Вид спорта</option><option>MMA</option><option>Grappling</option><option>BJJ</option><option>Wrestling</option></select>
            <input className="field" placeholder="Город" />
            <select className="field" defaultValue=""><option value="">Статус</option><option>Регистрация открыта</option><option>Регистрация закрыта</option></select>
          </div>
        </section>

        <h2 className="section-title">Ближайшие соревнования</h2>
        <section className="cards">
          {tournaments.map((tournament) => (
            <article className="card" key={tournament.name}>
              <div className="poster">AFL · CLUB OPEN</div>
              <div className="card-body">
                <h3>{tournament.name}</h3>
                <div className="meta">{tournament.date}<br />{tournament.city} · {tournament.sport}</div>
                <span className="status">{tournament.status}</span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
