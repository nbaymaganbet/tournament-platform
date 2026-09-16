import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import ShareEventButton from "@/components/share-event-button";

export default async function RegulationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const ru = locale === "ru";
  const s = await createClient();
  const { data: tournament } = await s.from("tournaments").select("id,name,date,city,venue,sport,status,is_public,regulations_text").eq("id", id).eq("is_public", true).maybeSingle();
  if (!tournament) notFound();

  const registrationOpen = tournament.status === "registration_open";
  const text = {
    back: ru ? "← К событию" : "← Жарысқа",
    title: ru ? "Положение соревнований" : "Жарыс ережесі",
    share: ru ? "Поделиться ссылкой на положение" : "Ережеге сілтемемен бөлісу",
    empty: ru ? "Положение пока не опубликовано." : "Ереже әлі жарияланбаған.",
    register: ru ? "Подать заявку" : "Өтінім беру",
    details: ru ? "Страница события" : "Жарыс парақшасы",
  };

  return (
    <main className="container public-tournament regulations-page">
      <div className="page-topline"><Link className="back-link" href={`/tournaments/${id}`}>{text.back}</Link></div>
      <header className="regulations-header">
        <div>
          <div className="eyebrow">{tournament.name}</div>
          <h1>{text.title}</h1>
          <p className="muted">{tournament.city || ""}{tournament.city && tournament.venue ? " · " : ""}{tournament.venue || ""}</p>
        </div>
        <div className="regulations-actions">
          <ShareEventButton title={`${tournament.name} — ${text.title}`} locale={locale} url={`/tournaments/${id}/regulations`} />
          {registrationOpen && <Link className="primary button-link" href={`/tournaments/${id}/register`}>{text.register}</Link>}
        </div>
      </header>

      <article className="regulations-document">
        {tournament.regulations_text ? (
          <div className="regulations-text">{tournament.regulations_text}</div>
        ) : (
          <div className="empty-state"><h2>{text.empty}</h2><p className="muted">{text.details}</p></div>
        )}
      </article>
    </main>
  );
}
