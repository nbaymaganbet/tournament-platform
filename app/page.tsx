import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/lib/i18n-server";

export default async function Home() {
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id,name,date,city,sport,status,poster_url")
    .eq("is_public", true)
    .neq("status", "draft")
    .order("date", { ascending: true });

  return (
    <main>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link className="brand" href="/">{t.brand}</Link>
          <div className="actions">
            <Link className="primary" href="/login">{t.login}</Link>
          </div>
        </div>
      </header>

      <div className="container">
        <section className="hero hero-compact">
          <div className="eyebrow">{locale === "ru" ? "СПОРТИВНЫЕ СОРЕВНОВАНИЯ" : "СПОРТТЫҚ ЖАРЫСТАР"}</div>
          <h1>{t.hero}</h1>
          <p>{t.heroText}</p>
        </section>

        <section>
          <div className="filters">
            <input className="field" placeholder={t.search} />
            <select className="field" defaultValue="">
              <option value="">{t.sport}</option>
              <option>MMA</option>
              <option>Grappling</option>
              <option>BJJ</option>
              <option>Wrestling</option>
            </select>
            <input className="field" placeholder={t.city} />
            <select className="field" defaultValue="">
              <option value="">{t.status}</option>
              <option>{t.open}</option>
            </select>
          </div>
        </section>

        <h2 className="section-title">{t.upcoming}</h2>

        {!tournaments?.length ? (
          <section className="empty-state">
            <h2>{t.noTournaments}</h2>
            <p className="muted">{t.createFirst}</p>
          </section>
        ) : (
          <section className="poster-feed" aria-label={t.upcoming}>
            {tournaments.map((x) => (
              <article className="poster-slide" key={x.id}>
                <Link className="poster-frame" href={`/tournaments/${x.id}`}>
                  {x.poster_url ? (
                    <img className="poster-image poster-image-full" src={x.poster_url} alt={x.name} />
                  ) : (
                    <div className="poster poster-fallback">{x.sport}</div>
                  )}
                </Link>
                <Link className="poster-slide-info" href={`/tournaments/${x.id}`}>
                  <div>
                    <h3>{x.name}</h3>
                    <div className="meta">
                      {new Date(x.date).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-RU")}
                      <br />
                      {x.city} · {x.sport}
                    </div>
                  </div>
                  <span className="status">
                    {x.status === "registration_open"
                      ? t.open
                      : x.status === "registration_closed"
                        ? t.registrationClosed
                        : x.status === "preparation"
                          ? t.preparation
                          : x.status === "running"
                            ? t.running
                            : t.completed}
                  </span>
                </Link>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
