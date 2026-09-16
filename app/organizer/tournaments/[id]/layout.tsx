import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizerTournamentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
  if (!organizer) notFound();

  const { data: tournament } = await supabase.from("tournaments").select("id").eq("id", id).eq("organizer_id", organizer.id).single();
  if (!tournament) notFound();

  return <div className="tp-organizer-shell"><div className="tp-organizer-content">{children}</div><style>{`.tp-organizer-content{min-height:100vh}.tp-organizer-content .primary,.tp-organizer-content .secondary,.tp-organizer-content .danger-button{padding:9px 12px;font-size:14px;line-height:1.2;border-radius:9px;min-height:40px}`}</style></div>;
}
