import { getLocale } from "@/lib/i18n-server";
import { uiText } from "@/lib/ui-text";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TournamentPermission =
  | "overview" | "participants" | "categories" | "weigh_in" | "brackets"
  | "schedule" | "running" | "results" | "settings" | "team" | "all_tournaments";

export async function hasTournamentPermission(
  supabase: SupabaseClient, tournamentId: string, permission: TournamentPermission,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: tournament } = await supabase.from("tournaments").select("organizer_id, organizers!inner(user_id)").eq("id", tournamentId).maybeSingle();
  const organizer = Array.isArray(tournament?.organizers) ? tournament.organizers[0] : tournament?.organizers;
  if (organizer?.user_id === user.id) return true;
  const { data, error } = await supabase.rpc("has_tournament_permission", { p_tournament_uuid: tournamentId, p_permission_key: permission });
  return !error && data === true;
}

export async function permissionDeniedPage(title?: string) {
  const locale = await getLocale();
  return <main className="container dashboard-page"><section className="empty-state"><h2>{title ?? uiText(locale, "Раздел недоступен")}</h2><p className="muted">{uiText(locale, "Этот раздел недоступен для вашей роли.")}</p></section></main>;
}
