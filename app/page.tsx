import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/lib/i18n-server";

const posterStyles = `
  .home-posters { margin-bottom: 48px; display: grid; gap: 28px; }
  .tournament-poster-group { min-width: 0; }
  .poster-carousel {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }
  .poster-carousel::-webkit-scrollbar { display: none; }
  .poster-card {
    flex: 0 0 min(760px, 88vw);
    height: min(760px, calc(100svh - 190px));
    min-height: 430px;
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
  .poster-fallback { width: 100%; height: 100%; pointer-events: none; display: grid; place-items: center; font-size: 32px; }
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
  .poster-count { margin: 0 0 10px; font-size: 12px; color: var(--muted); }
  @media (max-width: 760px) {
    .home-posters { margin-left: -10px; margin-right: -10px; }
    .tournament-poster-group > h2, .tournament-poster-group > .poster-count { margin-left: 10px; margin-right: 10px; }
    .poster-carousel { gap: 8px; padding-left: 10px; padding-right: 10px; }
    .poster-card { flex-basis: calc(100vw - 28px); height: calc(100svh - 150px); min-height: 430px; border-radius: 12px; }
    .poster-frame { padding: 6px; }
    .poster-slide-info { min-height: 72px; padding: 10px 12px; }
    .poster-slide-info h3 { font-size: 15px; }
    .poster-slide-info .status { font-size: 10px; }
  }
`;

type Poster = { public_url: string; sort_order: number };

type Tournament = {
  id: string;
  name: string;
  date: string | null;
  city: string | null;
  sport: string | null;
  status: string;
  poster_url: string | null;
  tournament_posters: Poster[] | null;
};

export default async function Home() {
  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id,name,date,city,sport,status,poster_url,tournament_posters(public_url,sort_order)")
    .eq("is_public", true)
    .neq("status", "draft")
    .order("date", { ascending: true, nullsFirst: false });

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

        <h2 className="section-title">{t.upcoming}</h2>

        {!tournaments?.length ? (
          <section className="empty-state">
            <h2>{t.noTournaments}</h2>
            <p className="muted">{t.createFirst}</p>
          </section>
        ) : (
          <section className="home-posters">
            {(tournaments as Tournament[]).map((x) => {
              const posters = [...(x.tournament_posters ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((p) => p.public_url);
              if (!posters.length && x.poster_url) posters.push(x.poster_url);

              return (
                <section className="tournament-poster-group" key={x.id}>
                  <h2 className="section-title">{x.name}</h2>
                  <p className="poster-count">{posters.length > 1 ? `Свайпните влево или вправо · ${posters.length} афиши` : ""}</p>
                  <div className="poster-carousel">
                    {posters.length ? posters.map((poster, index) => (
                      <article className="poster-card" key={`${x.id}-${index}`}>
                        <Link className="poster-frame" href={`/tournaments/${x.id}`}>
                          <img className="poster-image-full" src={poster} alt={`${x.name} — афиша ${index + 1}`} />
                        </Link>
                        <Link className="poster-slide-info" href={`/tournaments/${x.id}`}>
                          <div>
                            <h3>{x.name}</h3>
                            <div className="meta">
                              {x.date ? new Date(x.date).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-RU") : "Дата уточняется"}
                              <br />
                              {x.city || "Город уточняется"} · {x.sport || "Вид спорта уточняется"}
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
                    )) : (
                      <article className="poster-card">
                        <Link className="poster-frame" href={`/tournaments/${x.id}`}>
                          <div className="poster poster-fallback">{x.sport || "TOURNAMENT"}</div>
                        </Link>
                        <Link className="poster-slide-info" href={`/tournaments/${x.id}`}>
                          <div>
                            <h3>{x.name}</h3>
                            <div className="meta">{x.date ? new Date(x.date).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-RU") : "Дата уточняется"}</div>
                          </div>
                        </Link>
                      </article>
                    )}
                  </div>
                </section>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
