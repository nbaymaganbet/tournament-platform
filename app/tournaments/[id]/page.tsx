import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import ShareEventButton from "@/components/share-event-button";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const ru = locale === "ru";
  const s = await createClient();
  const { data: tournament } = await s.from("tournaments").select("id,name,poster_url,is_public,regulations_text,status").eq("id", id).eq("is_public", true).maybeSingle();
  if (!tournament) notFound();

  const registrationOpen = tournament.status === "registration_open";
  const text = {
    back: ru ? "← Главная" : "← Басты бет",
    register: ru ? "Подать заявку" : "Өтінім беру",
    regulations: ru ? "Посмотреть положение" : "Ережені көру",
    share: ru ? "Поделиться событием" : "Жарыспен бөлісу",
  };

  return (
    <main className="container public-tournament">
      <div className="page-topline"><Link className="back-link" href="/">{text.back}</Link></div>
      <section className="public-hero public-event-only">
        {tournament.poster_url && <img src={tournament.poster_url} alt={tournament.name} />}
        <div className="event-actions">
          {registrationOpen && <Link className="primary button-link" href={`/tournaments/${id}/register`}>{text.register}</Link>}
          {tournament.regulations_text && <Link className="button-link" href={`/tournaments/${id}/regulations`}>{text.regulations}</Link>}
          <ShareEventButton title={tournament.name} locale={locale} label={text.share} />
        </div>
      </section>
      <style>{`.public-event-only{display:flex;flex-direction:column;gap:16px}.public-event-only>img{display:block;width:100%;max-width:720px;margin:0 auto;border-radius:16px;object-fit:contain}.event-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}`}</style>
    </main>
  );
}
