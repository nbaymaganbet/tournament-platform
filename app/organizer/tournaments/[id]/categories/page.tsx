import DivisionLinks from "@/components/division-links";
import { availableDivisions } from "@/lib/tournament-divisions";
import { uiText } from "@/lib/ui-text";
import { getLocale } from "@/lib/i18n-server";
import Link from "@/components/pending-link";
import { hasTournamentPermission, permissionDeniedPage } from "@/lib/tournament-permissions";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CategoriesClient from "./categories-client";

export default async function CategoriesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
 const locale = await getLocale();const L = (text: string) => uiText(locale, text);

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await hasTournamentPermission(supabase, id, "categories"))) return permissionDeniedPage();
  const { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
  const { data: tournament } = await supabase.from("tournaments").select("id,name,organizer_id,bracket_format,bracket_rules_version,divisions").eq("id", id).single();
  if (!tournament) notFound();
  const { data: member } = await supabase.from("tournament_members").select("user_id").eq("tournament_id", id).eq("user_id", user.id).maybeSingle();
  if (organizer?.id !== tournament.organizer_id && !member) notFound();

  const divisions = availableDivisions(tournament.divisions);
  const { division } = await searchParams;
  const { count: legacyCount } = divisions.length ? await supabase.from("registrations")
    .select("id",{count:"exact",head:true}).eq("tournament_id",id).eq("division","") : {count:0};
  const { count: legacyCategories } = divisions.length ? await supabase.from("categories")
    .select("id",{count:"exact",head:true}).eq("tournament_id",id).eq("division","") : {count:0};
  const legacy = Boolean(legacyCount || legacyCategories);
  const selected = division === "legacy" && legacy ? "" : divisions.find(item=>item===division) ?? divisions[0] ?? "";
  const [{ data: categories, error }, { data: registrations }] = await Promise.all([
    supabase.from("categories").select("id,name,age_min,age_max,weight_min,weight_limit,weight_allowance,sort_order,bracket_format,round_seconds,round_count,round_rest_seconds,category_participants(participant_id,is_active,weigh_in_weight,weigh_in_status)").eq("tournament_id", id).eq("division",selected).order("sort_order"),
    supabase.from("registrations").select("participant_id,participants(id,first_name,last_name,age,weight,club,coach)").eq("tournament_id", id).eq("division",selected).eq("status", "confirmed").eq("payment_status", "paid"),
  ]);
  if (error) throw new Error(error.message);

  const participants = (registrations ?? []).flatMap((r) => {
    const p = Array.isArray(r.participants) ? r.participants[0] : r.participants;
    return p ? [p] : [];
  });
  const assignments: Record<string, string[]> = {};
  for (const c of categories ?? []) for (const cp of Array.isArray(c.category_participants) ? c.category_participants : []) if (cp.is_active !== false) (assignments[cp.participant_id] ??= []).push(c.id);

  return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div><header className="section-header"><div><div className="eyebrow">{L("ПОДГОТОВКА")}</div><h1>{L("Категории")}</h1><p className="muted">{L("Здесь создаются возрастные и весовые категории и распределяются подтверждённые участники. Взвешивание проводится в отдельной вкладке.")}</p></div></header><DivisionLinks base={`/organizer/tournaments/${id}/categories`} divisions={divisions} selected={selected} legacyLabel={legacy?(locale==="ru"?"Без раздела":"Бөлімсіз"):undefined}/><CategoriesClient key={selected} division={selected} divisions={divisions} tournamentId={id} defaultFormat={tournament.bracket_format} configurable={tournament.bracket_rules_version === 1} initialCategories={(categories ?? []).map((c) => ({ ...c, participantCount: Array.isArray(c.category_participants) ? c.category_participants.filter((cp) => cp.is_active !== false && participants.some((p) => p.id === cp.participant_id)).length : 0 }))} participants={participants} initialAssignments={assignments} /></main>;
}

