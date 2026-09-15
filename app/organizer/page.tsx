import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  registration_open: "Регистрация открыта",
  registration_closed: "Регистрация закрыта",
  preparation: "Подготовка",
  running: "Идёт соревнование",
  completed: "Завершено",
};

export default async function OrganizerDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer) {
    return (
      <main className="container dashboard-page">
        <header className="dashboard-header">
          <div>
            <div className="eyebrow">ОРГАНИЗАТОР</div>
            <h1>Кабинет организатора</h1>
          </div>
          <form action="/auth/signout" method="post">
            <button className="secondary">Выйти</button>
          </form>
        </header>
        <section className="empty-state">
          <h2>Профиль организатора ещё не создан</h2>
          <p className="muted">Аккаунт авторизован, но ему пока не назначен профиль организатора.</p>
        </section>
      </main>
    );
  }

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, slug, date, city, sport, status, is_public")
    .eq("organizer_id", organizer.id)
    .order("date", { ascending: false });

  return (
    <main className="container dashboard-page">
      <header className="dashboard-header">
        <div>
          <div className="eyebrow">ОРГАНИЗАТОР</div>
          <h1>{organizer.display_name || "Мои соревнования"}</h1>
          <p className="muted">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="secondary">Выйти</button>
        </form>
      </header>

      <div className="dashboard-actions">
        <h2>Мои соревнования</h2>
        <Link className="primary" href="/organizer/tournaments/new">Создать соревнование</Link>
      </div>

      {!tournaments?.length ? (
        <section className="empty-state">
          <h2>Пока нет соревнований</h2>
          <p className="muted">Создайте первое соревнование и начните собирать заявки.</p>
          <Link className="primary" href="/organizer/tournaments/new">Создать соревнование</Link>
        </section>
      ) : (
        <section className="dashboard-list">
          {tournaments.map((tournament) => (
            <Link className="dashboard-card" href={`/organizer/tournaments/${tournament.id}`} key={tournament.id}>
              <div>
                <h3>{tournament.name}</h3>
                <p className="muted">{tournament.date} · {tournament.city} · {tournament.sport}</p>
              </div>
              <span className="status">{statusLabels[tournament.status] ?? tournament.status}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
