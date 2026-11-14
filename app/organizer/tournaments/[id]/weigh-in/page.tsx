import DivisionSelect from "@/components/division-select";
import { availableDivisions, divisionNames } from "@/lib/tournament-divisions";
import { uiText } from "@/lib/ui-text";
import { getLocale } from "@/lib/i18n-server";
import Link from "@/components/pending-link";
import { hasTournamentPermission, permissionDeniedPage } from "@/lib/tournament-permissions";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WeighInClient from "./weigh-in-client";

export default async function WeighInPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
 const locale = await getLocale();const L = (text: string) => uiText(locale, text);

  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await hasTournamentPermission(supabase, id, "weigh_in"))) return permissionDeniedPage();
  const { data: tournament } = await supabase.from("tournaments").select("id,name,organizer_id,sport,divisions").eq("id", id).single();
  if (!tournament) notFound();
  const [{ data: organizer }, { data: member }] = await Promise.all([
    supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("tournament_members").select("role").eq("tournament_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (organizer?.id !== tournament.organizer_id && !member) notFound();

  const divisions = availableDivisions(tournament.divisions);
  const showDivisions = tournament.sport === "Грэпплинг" && divisions.length > 0;
  const { division } = await searchParams;
  const [{ count: legacyCount }, { count: legacyCategories }] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("tournament_id", id).eq("division", ""),
    supabase.from("categories").select("id", { count: "exact", head: true }).eq("tournament_id", id).eq("division", ""),
  ]);
  const legacy = Boolean(legacyCount || legacyCategories);
  const selected = showDivisions
    ? division === "legacy" && legacy ? "" : divisions.find(item => item === division) ?? "all"
    : "all";
  const scopes = selected === "all" ? [...divisions, ...(legacy || !divisions.length ? [""] : [])] : [selected];
  const [groups, { data: targetCategories, error: targetError }] = await Promise.all([Promise.all(scopes.map(async scope => {
    const [{ data: categories, error }, { data: registrations, error: registrationError }] = await Promise.all([
      supabase.from("categories").select("id,name,age_group_name,age_min,age_max,weight_limit,weight_allowance,sort_order,category_participants(participant_id,is_active,weigh_in_weight,weigh_in_status)").eq("tournament_id", id).eq("division", scope).order("sort_order"),
      supabase.from("registrations").select("participant_id,participants(id,first_name,last_name,age,weight,club,coach)").eq("tournament_id", id).eq("division", scope).eq("status", "confirmed").eq("payment_status", "paid"),
    ]);
    if (error || registrationError) throw new Error((error ?? registrationError)?.message);

    const participants = (registrations ?? []).flatMap(r => {
      const p = Array.isArray(r.participants) ? r.participants[0] : r.participants;
      return p ? [p] : [];
    });
    const weighIns: Record<string, { categoryId: string; weight: number | null; status: "pending" | "in_weight" | "out_of_weight" }> = {};
    const categoryList = (categories ?? []).map(({ category_participants, ...category }) => {
      const assignments = Array.isArray(category_participants) ? category_participants.filter(cp => cp.is_active !== false) : [];
      for (const cp of assignments) {
        weighIns[`${category.id}:${cp.participant_id}`] = { categoryId: category.id, weight: cp.weigh_in_weight ?? null, status: cp.weigh_in_status ?? "pending" };
      }
      return { ...category, name: [category.age_group_name, category.name].filter(Boolean).join(" · ") };
    });

    return { scope, categories: categoryList, participants, weighIns };
  })), supabase.from("categories").select("id,name,division,age_group_name").eq("tournament_id", id).order("sort_order")]);
  if (targetError) throw new Error(targetError.message);
  const legacyLabel = locale === "kk" ? "Бөлімсіз" : "Без раздела";
  const showGroupLabels = showDivisions && selected === "all";

  return <main className="container dashboard-page">
    <div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div>
    <header className="section-header"><div><div className="eyebrow">{L("ВЗВЕШИВАНИЕ")}</div><h1>{L("Взвешивание")}</h1><p className="muted">{L("Здесь фиксируется фактический вес каждого участника и статус «В весе» или «Не в весе».")}</p></div></header>
    {showDivisions && <DivisionSelect base={`/organizer/tournaments/${id}/weigh-in`} divisions={divisions} selected={selected} legacyLabel={legacy ? legacyLabel : undefined} includeAll />}
    {groups.map(group => <section key={`${selected}:${group.scope}`}>
      {showGroupLabels && <h2 className="section-title">{group.scope === "gi" || group.scope === "no_gi" ? divisionNames[group.scope] : legacyLabel}</h2>}
      {group.categories.length > 0
        ? <WeighInClient division={group.scope} tournamentId={id} initialCategories={group.categories} participants={group.participants} initialWeighIns={group.weighIns} preferPopulatedCategory={selected === "all"} targetCategories={targetCategories ?? []} />
        : <div className="empty-state">{locale === "kk" ? "Салмақ санаттары әлі қосылмаған." : "Весовые категории ещё не добавлены."}</div>}
    </section>)}
  </main>;
}
