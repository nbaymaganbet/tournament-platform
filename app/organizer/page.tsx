import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n-server";

export default async function OrganizerDashboard() {
  const supabase = await createClient();
  const t = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  let { data: organizer } = await supabase
    .from("organizers")
    .select("id, display_name, email")
    .eq("user_id", user.id)
    .maybeSingle();

  // Recover profiles for Auth users created before the organizer-profile flow
  // was added. RLS allows this insert only when user_id = auth.uid().
  if (!organizer) {
    const displayName = String(user.user_metadata?.display_name || user.email || "Организатор").trim();
    const email = user.email?.trim().toLowerCase() || null;

    await supabase.from("organizers").upsert(
      { user_id: user.id, display_name: displayName || "Организатор", email },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    const { data: recovered } = await supabase
      .from("organizers")
      .select("id, display_name, email")
      .eq("user_id", user.id)
      .maybeSingle();
    organizer = recovered;
  }

  const statusLabels: Record<string, string> = {
    draft: t.draft,
    registration_open: t.registrationOpen,
    registration_closed: t.registrationClosed,
    preparation: t.preparation,
    running: t.running,
    completed: t.completed,
  };

  if (!organizer) {
    return (
      <main className="container dashboard-page">
        <section className="empty-state">
          <h2>{t.profileMissing}</h2>
          <p className="muted">{t.profileMissingText}</p>
        </section>
      </main>
    );
  }

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, name, slug, date, city, sport, status, is_public")
      .eq("organizer_id", organizer.id),
    supabase
      .from("tournament_members")
      .select("tournament_id, role")
      .eq("user_id", user.id),
  ]);

  const memberIds = (memberships || []).map((m) => m.tournament_id);
  const { data: teamTournaments } = memberIds.length
    ? await supabase
        .from("tournaments")
        .select("id, name, slug, date, city, sport, status, is_public")
        .in("id", memberIds)
    : { data: [] as any[] };

  const map = new Map<string, any>();
  (owned || []).forEach((x) => map.set(x.id, { ...x, access: "owner" }));
  (teamTournaments || []).forEach((x) => {
    if (!map.has(x.id)) map.set(x.id, { ...x, access: "team" });
  });
  const tournaments = Array.from(map.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <main className="container dashboard-page">
      <header className="dashboard-header">
        <div>
          <div className="eyebrow">{t.organizer}</div>
          <h1>{organizer.display_name || t.myTournaments}</h1>
          <p className="muted">{user.email}</p>
        </div>
      </header>

      <div className="dashboard-actions">
        <h2>{t.myTournaments}</h2>
        <Link className="primary" href="/organizer/tournaments/new">{t.createTournament}</Link>
      </div>

      {!tournaments.length ? (
        <section className="empty-state">
          <h2>{t.noTournaments}</h2>
          <p className="muted">{t.createFirst}</p>
          <Link className="primary" href="/organizer/tournaments/new">{t.createTournament}</Link>
        </section>
      ) : (
        <section className="dashboard-list">
          {tournaments.map((tournament) => (
            <Link className="dashboard-card" href={`/organizer/tournaments/${tournament.id}`} key={tournament.id}>
              <div>
                <h3>{tournament.name}</h3>
                <p className="muted">
                  {tournament.date} · {tournament.city} · {tournament.sport}
                  {tournament.access === "team" ? " · Команда" : ""}
                </p>
              </div>
              <span className="status">{statusLabels[tournament.status] ?? tournament.status}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
