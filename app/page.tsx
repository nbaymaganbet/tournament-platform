"use client";

import { useEffect, useState } from "react";
import { translations, type Locale } from "@/lib/i18n";

const tournaments = [{ name: "AFL ASTANA FIGHT LEAGUE — CLUB OPEN", sport: "MMA" }];

export default function Home() {
  const [showIntro, setShowIntro] = useState(false);
  const [slide, setSlide] = useState(0);
  const [lang, setLang] = useState<Locale>("ru");
  const t = translations[lang];

  useEffect(() => setShowIntro(localStorage.getItem("tp-intro-seen") !== "1"), []);

  function finishIntro() {
    localStorage.setItem("tp-intro-seen", "1");
    setShowIntro(false);
  }

  if (showIntro) {
    const current = t.intro[slide];
    return (
      <main className="intro">
        <section className="intro-card" aria-label="Tournament Platform introduction">
          <div className="intro-step">TOURNAMENT PLATFORM · {slide + 1}/{t.intro.length}</div>
          <h2>{current.title}</h2>
          <p>{current.text}</p>
          {current.items.length > 0 && <ul className="intro-list">{current.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          <div className="intro-actions">
            {slide > 0 && <button className="secondary" onClick={() => setSlide(slide - 1)}>{t.back}</button>}
            {slide < t.intro.length - 1 ? <button className="primary" onClick={() => setSlide(slide + 1)}>{t.next}</button> : <button className="primary" onClick={finishIntro}>{t.start}</button>}
            <button className="secondary" onClick={finishIntro}>{t.skip}</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <div className="container topbar-inner">
          <a className="brand" href="/">{t.brand}</a>
          <div className="actions">
            <button className="lang" onClick={() => setLang(lang === "ru" ? "kk" : "ru")}>{lang === "ru" ? "ҚАЗ" : "РУС"}</button>
            <button className="primary">{t.login}</button>
          </div>
        </div>
      </header>
      <div className="container">
        <section className="hero">
          <div className="eyebrow">{lang === "ru" ? "СПОРТИВНЫЕ СОРЕВНОВАНИЯ" : "СПОРТТЫҚ ЖАРЫСТАР"}</div>
          <h1>{t.hero}</h1>
          <p>{t.heroText}</p>
        </section>
        <section>
          <div className="filters">
            <input className="field" placeholder={t.search} />
            <select className="field" defaultValue=""><option value="">{t.sport}</option><option>MMA</option><option>Grappling</option><option>BJJ</option><option>Wrestling</option></select>
            <input className="field" placeholder={t.city} />
            <select className="field" defaultValue=""><option value="">{t.status}</option><option>{t.open}</option></select>
          </div>
        </section>
        <h2 className="section-title">{t.upcoming}</h2>
        <section className="cards">
          {tournaments.map((tournament) => (
            <a className="card" href="/tournaments/afl-club-open" key={tournament.name}>
              <div className="poster">AFL · CLUB OPEN</div>
              <div className="card-body">
                <h3>{tournament.name}</h3>
                <div className="meta">{lang === "ru" ? "25 сентября 2026" : "2026 жылғы 25 қыркүйек"}<br />Астана · {tournament.sport}</div>
                <span className="status">{t.open}</span>
              </div>
            </a>
          ))}
        </section>
      </div>
    </main>
  );
}
