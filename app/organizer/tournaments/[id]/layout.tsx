import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TournamentSidebar from "./tournament-sidebar";

export default async function OrganizerTournamentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
  if (!organizer) notFound();

  const { data: tournament } = await supabase.from("tournaments").select("id,name").eq("id", id).eq("organizer_id", organizer.id).single();
  if (!tournament) notFound();

  return (
    <div className="tp-organizer-shell">
      <TournamentSidebar tournamentId={id} tournamentName={tournament.name} />
      <div className="tp-organizer-content">{children}</div>
    </div>
  );
}
