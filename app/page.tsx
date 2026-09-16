import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/lib/i18n-server";

const posterStyles = `
  .home-posters { margin-bottom: 48px; }
  .poster-feed {
    height: auto;
    display: grid;
    gap: 14px;
    max-width: 860px;
    margin: 0 auto;
    overflow: visible;
    scrollbar-width: none;
  }
  .poster-slide {
    height: min(760px, calc(100svh - 150px));
    min-height: 520px;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: linear-gradient(145deg, var(--surface-2), var(--surface));
    box-shadow: var(--shadow);
    scroll-snap-align: start;
  }
  .poster-frame {
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    background: #090a0c;
  }
  .poster-image-full {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
  }
  .poster-fallback { width: 100%; height: 100%; aspect-ratio: auto; pointer-events: none; }
  .poster-slide-info {
    min-height: 78px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
    background: rgba(17,19,23,.96);
  }
  .poster-slide-info h3 { margin: 0 0 3px; font-size: 17px; }
  .poster-slide-info .meta { line-height: 1.35; }
  .poster-slide-info .status { flex: none; margin: 0; }
  @media (max-width: 760px) {
    .home-posters { margin-left: -10px; margin-right: -10px; }
    .poster-feed { gap: 10px; }
    .poster-slide {
      height: calc(100svh - 84px);
      min-height: 430px;
      border-radius: 12px;
    }
    .poster-frame { padding: 6px; }
    .poster-slide-info { min-height: 72px; padding: 10px 12px; }
    .poster-slide-info h3 { font-size: 15px; }
    .poster-slide-info .status { font-size: 10px; }
  }
`;

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
      <style>{posterStyles}</style>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link className="brand" href="/">{t.brand}</Link>
        </div>
      </header>

      <div className="container">
        <section className="hero">
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
          <section className="home-posters">
            <div className="poster-feed">
              {tournaments.map((x) => (
                <article className="poster-slide" key={x.id}>
                  <Link className="poster-frame" href={`/tournaments/${x.id}`}>
                    {x.poster_url ? (
                      <img className="poster-image-full" src={x.poster_url} alt={x.name} />
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
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
