import PosterGallery from "@/components/poster-gallery";
import LiveRefresh from "@/components/live-refresh";
import { uiText } from "@/lib/ui-text";
import Link from "@/components/pending-link";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/lib/i18n-server";

const posterStyles = `
  .home-posters { margin-bottom: 48px; display: grid; gap: 28px; }
  .tournament-poster-group { min-width: 0; }
  .poster-card {
    width: min(760px, 100%);
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: linear-gradient(145deg, var(--surface-2), var(--surface));
    box-shadow: var(--shadow);
  }
  .poster-slide-info {
    min-height: 78px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
    background: rgba(17,19,23,.96);
  }
  .poster-slide-info > div { min-width: 0; flex: 1 1 180px; overflow-wrap: anywhere; }
  .poster-slide-info h3 { margin: 0 0 3px; font-size: 17px; }
  .poster-slide-info .meta { line-height: 1.35; }
  .poster-slide-info .status { flex: none; margin: 0; }
  @media (max-width: 760px) {
    .poster-card { border-radius: 12px; }
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
 const L = (text: string) => uiText(locale, text);

  const t = await getT();
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id,name,date,city,sport,status,poster_url,tournament_posters(public_url,sort_order)")
    .eq("is_public", true)
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  return (
    <main><LiveRefresh tables="tournaments" />
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
                  <article className="poster-card">
                    <PosterGallery
                      posters={posters.map((display) => ({ display }))}
                      title={x.name}
                      locale={locale}
                      eventHref={`/tournaments/${x.id}`}
                      fallback={x.sport || "TOURNAMENT"}
                    />
                    <Link className="poster-slide-info" href={`/tournaments/${x.id}`}>
                      <div>
                        <h3>{x.name}</h3>
                        <div className="meta">
                          {x.date ? new Date(x.date).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-RU") : L("Дата уточняется")}
                          {posters.length > 0 && <><br />{x.city || L("Город уточняется")} · {x.sport || L("Вид спорта уточняется")}</>}
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
                </section>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

