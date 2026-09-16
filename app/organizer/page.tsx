import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n-server";

export default async function OrganizerDashboard() {
  const supabase = await createClient();
  const t = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: organizer } = await supabase.from("organizers").select("id, display_name").eq("user_id", user.id).maybeSingle();

  const statusLabels: Record<string, string> = {
    draft: t.draft, registration_open: t.registrationOpen, registration_closed: t.registrationClosed,
    preparation: t.preparation, running: t.running, completed: t.completed,
  };

  if (!organizer) return <main className="container dashboard-page"><header className="dashboard-header"><div><div className="eyebrow">{t.organizer}</div><h1>{t.organizerCabinet}</h1></div><form action="/auth/signout" method="post"><button className="secondary">{t.logout}</button></form></header><section className="empty-state"><h2>{t.profileMissing}</h2><p className="muted">{t.profileMissingText}</p></section></main>;

  const { data: tournaments } = await supabase.from("tournaments").select("id, name, slug, date, city, sport, status, is_public").eq("organizer_id", organizer.id).order("date", { ascending: false });
  return <main className="container dashboard-page"><header className="dashboard-header"><div><div className="eyebrow">{t.organizer}</div><h1>{organizer.display_name || t.myTournaments}</h1><p className="muted">{user.email}</p></div><form action="/auth/signout" method="post"><button className="secondary">{t.logout}</button></form></header><div className="dashboard-actions"><h2>{t.myTournaments}</h2><Link className="primary" href="/organizer/tournaments/new">{t.createTournament}</Link></div>{!tournaments?.length?<section className="empty-state"><h2>{t.noTournaments}</h2><p className="muted">{t.createFirst}</p><Link className="primary" href="/organizer/tournaments/new">{t.createTournament}</Link></section>:<section className="dashboard-list">{tournaments.map(tournament=><Link className="dashboard-card" href={`/organizer/tournaments/${tournament.id}`} key={tournament.id}><div><h3>{tournament.name}</h3><p className="muted">{tournament.date} · {tournament.city} · {tournament.sport}</p></div><span className="status">{statusLabels[tournament.status]??tournament.status}</span></Link>)}</section>}</main>;
}
