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

export function permissionDeniedPage(title = "Раздел недоступен") {
  return <main className="container dashboard-page"><section className="empty-state"><h2>{title}</h2><p className="muted">Этот раздел недоступен для вашей роли.</p></section></main>;
}