import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getT } from "@/lib/i18n-server";
import LiveTournament from "./live-tournament";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getT();
  const s = await createClient();
  const { data: tournament } = await s.from("tournaments").select("id,name,date,city,venue,sport,description,entry_fee,registration_deadline,status,poster_url,is_public").eq("id", id).eq("is_public", true).maybeSingle();
  if (!tournament) notFound();
  const [{ data: docs }, { data: cats }, { data: matches }, { data: results }] = await Promise.all([
    s.from("documents").select("id,name,storage_path,mime_type").eq("tournament_id", id).eq("is_public", true).order("created_at"),
    s.from("categories").select("id,name,age_min,age_max,weight_limit").eq("tournament_id", id).order("sort_order"),
    s.from("matches").select("id,match_number,round_number,status,winner_id,category_id,participant_a_id,participant_b_id,participants_a:participants!matches_participant_a_id_fkey(first_name,last_name),participants_b:participants!matches_participant_b_id_fkey(first_name,last_name)").eq("tournament_id", id).order("match_number"),
    s.from("results").select("place,category_id,participants(first_name,last_name)").eq("tournament_id", id).order("place"),
  ]);
  const matchIds = (matches ?? []).map((m) => m.id);
  const { data: schedule } = matchIds.length ? await s.from("match_schedule").select("match_id,scheduled_order,approximate_time,mats(name)").in("match_id", matchIds).order("scheduled_order") : { data: [] };
  const initialMatches = (matches ?? []).map((m: any) => ({ ...m, participantA: Array.isArray(m.participants_a) ? m.participants_a[0] : m.participants_a, participantB: Array.isArray(m.participants_b) ? m.participants_b[0] : m.participants_b }));
  const registrationOpen = tournament.status === "registration_open";
  const publicDoc = docs?.[0] ?? null;
  const dateLocale = locale === "kk" ? "kk-KZ" : "ru-RU";
  const deadline = tournament.registration_deadline ? new Date(tournament.registration_deadline).toLocaleDateString(dateLocale) : null;
  const ru = locale === "ru";
  const text = {
    home: ru ? "Главная" : "Басты бет", registration: ru ? "Регистрация" : "Тіркелу", open: ru ? "Открыта" : "Ашық", closed: ru ? "Закрыта" : "Жабық", fee: ru ? "Взнос" : "Жарна", status: ru ? "Статус" : "Мәртебесі", publicUpdated: ru ? "Публичная информация обновляется автоматически." : "Жария ақпарат автоматты түрде жаңартылады.", categories: ru ? "Категории" : "Санаттар", years: ru ? "лет" : "жас", kg: ru ? "кг" : "кг", placeUnknown: ru ? "Место уточняется" : "Орыны нақтыланады", regulations: ru ? "Положение" : "Ереже", openRegulations: ru ? "Открыть положение" : "Ережені ашу", registrationUntil: ru ? "Регистрация до" : "Тіркелу мерзімі", register: ru ? "Подать заявку" : "Өтінім беру", entryNotSet: ru ? "Взнос не указан" : "Жарна көрсетілмеген" 
  };

  return <main className="container public-tournament">
    <div className="page-topline"><Link className="back-link" href={`/`}>← {text.home}</Link></div>
    <header className="public-hero">{tournament.poster_url && <img src={tournament.poster_url} alt="" />}<div><div className="eyebrow">{tournament.sport} · {tournament.city}</div><h1>{tournament.name}</h1><p className="muted">{new Date(tournament.date).toLocaleDateString(dateLocale)} · {tournament.venue || text.placeUnknown}</p>{tournament.description && <p>{tournament.description}</p>}{registrationOpen && <Link className="primary button-link" href={`/tournaments/${id}/register`}>{text.register}</Link>}</div></header>
    <section className="info-grid"><article className="info-card"><div className="eyebrow">{text.registration.toUpperCase()}</div><strong>{registrationOpen ? text.open : text.closed}</strong><p className="muted">{tournament.entry_fee != null ? `${text.fee}: ${tournament.entry_fee} ₸` : text.entryNotSet}{deadline ? ` · ${text.registrationUntil} ${deadline}` : ""}</p></article><article className="info-card"><div className="eyebrow">{text.status.toUpperCase()}</div><strong>{tournament.status === "registration_open" ? t.registrationOpen : tournament.status === "registration_closed" ? t.registrationClosed : tournament.status === "preparation" ? t.preparation : tournament.status === "running" ? t.running : t.completed}</strong><p className="muted">{text.publicUpdated}</p></article></section>
    <section className="public-section"><h2>{text.categories}</h2><div className="cards-grid">{(cats ?? []).map((c: any) => <article className="info-card" key={c.id}><strong>{c.name}</strong><p className="muted">{c.age_min != null && c.age_max != null ? `${c.age_min}–${c.age_max} ${text.years}` : ""}{c.weight_limit != null ? ` · ${ru ? "до" : "дейін"} ${c.weight_limit} ${text.kg}` : ""}</p></article>)}</div></section>
    <LiveTournament tournamentId={id} initialMatches={initialMatches} initialResults={results ?? []} initialSchedule={(schedule ?? []) as any} />
    {publicDoc && <section className="public-section"><h2>{text.regulations}</h2><a className="button-link secondary" href={publicDoc.storage_path} target="_blank" rel="noreferrer">{text.openRegulations}</a></section>}
  </main>;
}
