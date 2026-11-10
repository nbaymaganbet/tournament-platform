import PosterGallery from "@/components/poster-gallery";
import LiveRefresh from "@/components/live-refresh";
import { uiText } from "@/lib/ui-text";
import Link from "@/components/pending-link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import ShareEventButton from "@/components/share-event-button";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
 const L = (text: string) => uiText(locale, text);

  const { id } = await params;
  const locale = await getLocale();
  const ru = locale === "ru";
  const s = await createClient();
  const { data: tournament } = await s.from("tournaments").select("id,name,date,city,venue,sport,description,registration_deadline,status,poster_url,is_public,regulations_text").eq("id", id).eq("is_public", true).maybeSingle();
  if (!tournament) notFound();

  const { data: posters } = await s.from("tournament_posters").select("public_url,storage_path,sort_order").eq("tournament_id", id).order("sort_order");
  const posterImages = posters?.length ? posters.map(p => ({
    display: p.public_url,
    original: s.storage.from("posters").getPublicUrl(p.storage_path).data.publicUrl,
  })) : tournament.poster_url ? [{ display: tournament.poster_url, original: tournament.poster_url }] : [];

  const registrationOpen = tournament.status === "registration_open";
  const dateLocale = locale === "kk" ? "kk-KZ" : "ru-RU";
  const text = {
    back: ru ? "← Главная" : "← Басты бет",
    register: ru ? "Подать заявку" : "Өтінім беру",
    regulations: ru ? "Посмотреть положение" : "Ережені көру",
    results: ru ? "Результаты" : "Нәтижелер",
    share: ru ? "Поделиться событием" : "Жарыспен бөлісу",
    placeUnknown: ru ? "Место уточняется" : "Орыны нақтыланады",
  };

  return (
    <main className="container public-tournament"><LiveRefresh tournamentId={id} tables="tournaments" />
      <div className="page-topline"><Link className="back-link" href="/">{text.back}</Link></div>
      <header className="public-hero">
        {posterImages.length > 0 && <PosterGallery posters={posterImages} title={tournament.name} locale={locale} />}
        <div>
          <div className="eyebrow">{tournament.sport} · {tournament.city}</div>
          <h1>{tournament.name}</h1>
          <p className="muted">{tournament.date ? new Date(tournament.date).toLocaleDateString(dateLocale) : L("Дата уточняется")} · {tournament.venue || text.placeUnknown}</p>
          {tournament.description && <p>{tournament.description}</p>}
          <div className="event-actions">
            {registrationOpen && <Link className="primary button-link" href={`/tournaments/${id}/register`}>{text.register}</Link>}
            {<Link className="primary button-link" href={`/tournaments/${id}/results`}>{text.results}</Link>}
            <Link className="button-link" href={`/tournaments/${id}/participants`}>{ru?"Участники":"Қатысушылар"}</Link>
            <Link className="button-link" href={`/tournaments/${id}/brackets`}>{ru?"Сетки и расписание":"Торлар мен кесте"}</Link>
            {tournament.regulations_text && <Link className="button-link" href={`/tournaments/${id}/regulations`}>{text.regulations}</Link>}
            <ShareEventButton title={tournament.name} locale={locale} label={text.share} />
          </div>
        </div>
      </header>
    </main>
  );
}

