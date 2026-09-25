import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export default async function OrganizerTournamentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: tournament } = await supabase.from("tournaments").select("id, organizer_id, name").eq("id", id).single();
  if (!tournament) notFound();
  const [{ data: organizer }, { data: member }] = await Promise.all([
    supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("tournament_members").select("role").eq("tournament_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (organizer?.id !== tournament.organizer_id && !member) notFound();
  return <div className="tp-organizer-shell"><TournamentSidebar tournamentId={id} tournamentName={tournament.name} /><div className="tp-organizer-content">{children}</div><style>{".tp-organizer-content{min-height:100vh}@media(min-width:901px){.tp-organizer-content{margin-left:298px}}.tp-organizer-content .primary,.tp-organizer-content .secondary,.tp-organizer-content .danger-button{padding:9px 12px;font-size:14px;line-height:1.2;border-radius:9px;min-height:40px}"}</style></div>;
}