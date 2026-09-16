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

  const [{ data: categories, error }, { data: registrations }] = await Promise.all([
    supabase.from("categories").select("id,name,age_min,age_max,weight_limit,weight_allowance,sort_order,category_participants(participant_id,is_active)").eq("tournament_id", id).order("sort_order"),
    supabase.from("registrations").select("participant_id,participants(id,first_name,last_name,age,weight,club,coach)").eq("tournament_id", id).eq("status", "confirmed").eq("payment_status", "paid"),
  ]);
  if (error) throw new Error(error.message);

  const participants = (registrations ?? []).flatMap((r) => {
    const p = Array.isArray(r.participants) ? r.participants[0] : r.participants;
    return p ? [p] : [];
  });
  const assignments: Record<string, string> = {};
  for (const c of categories ?? []) for (const cp of Array.isArray(c.category_participants) ? c.category_participants : []) if (cp.is_active !== false) assignments[cp.participant_id] = c.id;

  return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div><header className="section-header"><div><div className="eyebrow">ПОДГОТОВКА</div><h1>Категории</h1><p className="muted">Создавайте категории вручную и распределяйте только оплаченных и подтверждённых участников.</p></div></header><CategoriesClient tournamentId={id} initialCategories={(categories ?? []).map((c) => ({ ...c, participantCount: Array.isArray(c.category_participants) ? c.category_participants.filter((cp) => cp.is_active !== false && participants.some((p) => p.id === cp.participant_id)).length : 0 }))} participants={participants} initialAssignments={assignments} /></main>;
}
