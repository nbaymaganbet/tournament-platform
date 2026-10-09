import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import ResultCategory from "@/components/result-category";
import type { Result } from "../page";
import "../results.css";

type Props = { params: Promise<{ id: string; categoryId: string }> };

async function categoryResults(id: string, categoryId: string) {
  const s = await createClient();
  const { data: tournament } = await s.from("tournaments").select("name,poster_url").eq("id", id).eq("is_public", true).eq("status", "completed").maybeSingle();
  if (!tournament) return null;
  const { data, error } = await s.rpc("get_public_tournament_results_detailed", { p_tournament_id: id });
  if (error) throw new Error("Could not load tournament results");
  const rows = ((data ?? []) as Result[]).filter(row => row.category_id === categoryId);
  return rows.length ? { tournament, rows, categoryName: rows[0].category_name } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, categoryId } = await params;
  const result = await categoryResults(id, categoryId);
  if (!result) return { title: "Результаты" };
  const title = `${result.categoryName} · ${result.tournament.name}`;
  const description = result.rows.map(r => `${r.place === 1 ? "🥇" : r.place === 2 ? "🥈" : r.place === 3 ? "🥉" : `${r.place}.`} ${r.athlete_name} · ${r.age ?? "—"} лет · ${r.club || "Клуб не указан"} · ${r.coach || "Тренер не указан"}`).join(" · ");
  const url = `https://tournament-platform-drab.vercel.app/tournaments/${id}/results/${categoryId}`;
  return { title, description, openGraph: { title, description, type: "website", url, images: [{ url: `${url}/opengraph-image?v=2` }] }, twitter: { card: "summary_large_image", title, description, images: [`${url}/opengraph-image?v=2`] } };
}

export default async function CategoryResults({ params }: Props) {
  const { id, categoryId } = await params;
  const result = await categoryResults(id, categoryId);
  if (!result) notFound();
  const locale = await getLocale();
  return <main className="container dashboard-page">
    <div className="page-topline"><Link className="back-link" href={`/tournaments/${id}/results`}>← {locale === "kk" ? "Барлық нәтижелер" : "Все результаты"}</Link></div>
    <header className="section-header"><div><div className="eyebrow">{result.tournament.name}</div><h1>{locale === "kk" ? "Нәтижелер" : "Результаты"}</h1></div></header>
    {result.tournament.poster_url && <img src={result.tournament.poster_url} alt={`${result.tournament.name} — афиша`} style={{ display: "block", width: "100%", maxWidth: 520, maxHeight: 680, objectFit: "contain", marginBottom: 20, borderRadius: 14 }} />}
    <ResultCategory tournamentId={id} tournamentName={result.tournament.name} categoryId={categoryId} categoryName={result.categoryName} locale={locale} athletes={result.rows.map(r => ({ id: `${r.place}:${r.athlete_name}`, place: r.place, name: r.athlete_name, age: r.age, club: r.club, coach: r.coach }))} />
  </main>;
}
