import Link from "next/link";
import { hasTournamentPermission, permissionDeniedPage } from "@/lib/tournament-permissions";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WeighInClient from "./weigh-in-client";

export default async function WeighInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await hasTournamentPermission(supabase, id, "weigh_in"))) return permissionDeniedPage();
  const { data: tournament } = await supabase.from("tournaments").select("id,name,organizer_id").eq("id", id).single();
  if (!tournament) notFound();
  const [{ data: organizer }, { data: member }] = await Promise.all([
    supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("tournament_members").select("role").eq("tournament_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (organizer?.id !== tournament.organizer_id && !member) notFound();

  const [{ data: categories, error }, { data: registrations }] = await Promise.all([
    supabase.from("categories").select("id,name,age_min,age_max,weight_limit,weight_allowance,sort_order,category_participants(participant_id,is_active,weigh_in_weight,weigh_in_status)").eq("tournament_id", id).order("sort_order"),
    supabase.from("registrations").select("participant_id,participants(id,first_name,last_name,age,weight,club,coach)").eq("tournament_id", id).eq("status", "confirmed").eq("payment_status", "paid"),
  ]);
  if (error) throw new Error(error.message);

  const participants = (registrations ?? []).flatMap((r) => {
    const p = Array.isArray(r.participants) ? r.participants[0] : r.participants;
    return p ? [p] : [];
  });
  const assignments: Record<string, string> = {};
  const weighIns: Record<string, { categoryId:string; weight:number|null; status:"pending"|"in_weight"|"out_of_weight" }> = {};
  for (const c of categories ?? []) for (const cp of Array.isArray(c.category_participants) ? c.category_participants : []) if (cp.is_active !== false) {
    assignments[cp.participant_id] = c.id;
    weighIns[cp.participant_id] = { categoryId:c.id, weight:cp.weigh_in_weight ?? null, status:cp.weigh_in_status ?? "pending" };
  }

  return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div><header className="section-header"><div><div className="eyebrow">ВЗВЕШИВАНИЕ</div><h1>Взвешивание</h1><p className="muted">Здесь фиксируется фактический вес каждого участника и статус «В весе» или «Не в весе».</p></div></header><WeighInClient tournamentId={id} initialCategories={(categories ?? []).map((c) => ({ id:c.id,name:c.name,age_min:c.age_min,age_max:c.age_max,weight_limit:c.weight_limit,weight_allowance:c.weight_allowance,participantCount:Array.isArray(c.category_participants)?c.category_participants.filter(cp=>cp.is_active!==false).length:0 }))} participants={participants} initialAssignments={assignments} initialWeighIns={weighIns} /></main>;
}
