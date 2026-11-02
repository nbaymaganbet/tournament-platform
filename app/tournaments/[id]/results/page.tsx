import LiveRefresh from "@/components/live-refresh";
import Link from "@/components/pending-link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import ResultsFilter from "@/app/organizer/tournaments/[id]/results/results-filter";
import ResultCategory, { type ResultAthlete } from "@/components/result-category";
import "./results.css";

export type Result = { category_id: string; category_name: string; place: number; athlete_name: string; age: number | null; club: string | null; coach: string | null };

export default async function PublicResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createClient();
  const locale = await getLocale();
  const kk = locale === "kk";
  const { data: tournament } = await s.from("tournaments").select("name").eq("id", id).eq("is_public", true).neq("status", "draft").maybeSingle();
  if (!tournament) notFound();
  const { data, error } = await s.rpc("get_public_tournament_results_detailed", { p_tournament_id: id });
  if (error) throw new Error("Could not load tournament results");
  const groups = new Map<string, { name: string; rows: ResultAthlete[] }>();
  for (const row of (data ?? []) as Result[]) {
    const group = groups.get(row.category_id) ?? { name: row.category_name, rows: [] };
    group.rows.push({ id: `${row.place}:${row.athlete_name}`, place: row.place, name: row.athlete_name, age: row.age, club: row.club, coach: row.coach });
    groups.set(row.category_id, group);
  }
  return <main className="container dashboard-page"><LiveRefresh tournamentId={id} tables="tournaments,categories,results" />
    <div className="page-topline"><Link className="back-link" href={`/tournaments/${id}`}>← {tournament.name}</Link></div>
    <header className="section-header"><div><div className="eyebrow">{tournament.name}</div><h1>{kk ? "Нәтижелер" : "Результаты"}</h1></div></header>
    {groups.size === 0 ? <div className="empty-state">{kk ? "Нәтижелер әлі жарияланбаған." : "Результаты пока не опубликованы."}</div> :
      <ResultsFilter tournamentId={id} tournamentName={tournament.name} groups={[...groups].map(([id,g])=>({id,name:g.name,athletes:g.rows}))} locale={locale} share/>}

  </main>;
}
