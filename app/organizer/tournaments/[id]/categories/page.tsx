import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CategoriesClient from "./categories-client";

export default async function CategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
  if (!organizer) notFound();
  const { data: tournament } = await supabase.from("tournaments").select("id,name").eq("id", id).eq("organizer_id", organizer.id).single();
  if (!tournament) notFound();
  const { data: categories, error } = await supabase.from("categories").select("id,name,age_min,age_max,weight_limit,sort_order,category_participants(participant_id)").eq("tournament_id", id).order("sort_order");
  if (error) throw new Error(error.message);
  return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div><header className="section-header"><div><div className="eyebrow">ПОДГОТОВКА</div><h1>Категории</h1><p className="muted">Создавайте категории вручную и распределяйте подтверждённых участников.</p></div></header><CategoriesClient tournamentId={id} initialCategories={(categories ?? []).map((c) => ({ ...c, participantCount: Array.isArray(c.category_participants) ? c.category_participants.length : 0 }))} /></main>;
}
