import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";

type Result = { category_id: string; category_name: string; place: number; athlete_name: string; club: string | null };

export default async function PublicResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await createClient();
  const kk = (await getLocale()) === "kk";
  const { data: tournament } = await s.from("tournaments").select("name").eq("id", id).eq("is_public", true).eq("status", "completed").maybeSingle();
  if (!tournament) notFound();
  const { data, error } = await s.rpc("get_public_tournament_results", { p_tournament_id: id });
  if (error) throw new Error("Could not load tournament results");
  const groups = new Map<string, { name: string; rows: Result[] }>();
  for (const row of (data ?? []) as Result[]) {
    const group = groups.get(row.category_id) ?? { name: row.category_name, rows: [] };
    group.rows.push(row);
    groups.set(row.category_id, group);
  }
  return <main className="container dashboard-page">
    <div className="page-topline"><Link className="back-link" href={`/tournaments/${id}`}>← {tournament.name}</Link></div>
    <header className="section-header"><div><div className="eyebrow">{tournament.name}</div><h1>{kk ? "Нәтижелер" : "Результаты"}</h1></div></header>
    {groups.size === 0 ? <div className="empty-state">{kk ? "Нәтижелер әлі жарияланбаған." : "Результаты пока не опубликованы."}</div> :
      [...groups].map(([categoryId, group]) => <section key={categoryId} className="form-card" style={{ marginBottom: 14 }}>
        <h2>{group.name}</h2>
        <div className="participants-list">{group.rows.map(row => <div key={`${row.place}:${row.athlete_name}`} className="participant-card">
          <div className="participant-main"><strong>{row.place === 1 ? "🥇" : row.place === 2 ? "🥈" : row.place === 3 ? "🥉" : `${row.place}.`} {row.athlete_name}</strong>
            {row.club && <span className="muted">{row.club}</span>}</div>
        </div>)}</div>
      </section>)}
  </main>;
}
