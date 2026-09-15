import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  registration_open: "Регистрация открыта",
  registration_closed: "Регистрация закрыта",
  preparation: "Подготовка",
  running: "Идёт соревнование",
  completed: "Завершено",
};

export default async function OrganizerTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer) notFound();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, date, city, venue, sport, description, entry_fee, registration_deadline, status, is_public")
    .eq("id", id)
    .eq("organizer_id", organizer.id)
    .single();

  if (!tournament) notFound();

  const [participants, categories, matches, mats] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("categories").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("mats").select("id", { count: "exact", head: true }).eq("tournament_id", id),
  ]);

  return (
    <main className="container dashboard-page">
      <div className="page-topline">
        <Link className="back-link" href="/organizer">← Мои соревнования</Link>
      </div>

      <header className="tournament-header">
        <div>
          <div className="eyebrow">{tournament.sport}</div>
          <h1>{tournament.name}</h1>
          <p className="muted">{tournament.date} · {tournament.city}{tournament.venue ? ` · ${tournament.venue}` : ""}</p>
        </div>
        <span className="status">{statusLabels[tournament.status] ?? tournament.status}</span>
      </header>

      <nav className="tournament-nav" aria-label="Разделы соревнования">
        {[
          ["Обзор", "#overview"],
          ["Участники", "#participants"],
          ["Категории", "#categories"],
          ["Сетки", "#brackets"],
          ["Расписание", "#schedule"],
          ["Ковры", "#mats"],
          ["Проведение", "#running"],
          ["Результаты", "#results"],
          ["Настройки", "#settings"],
        ].map(([label, href]) => <a href={href} key={href}>{label}</a>)}
      </nav>

      <section className="stat-grid" id="overview">
        <div className="stat-card"><strong>{participants.count ?? 0}</strong><span>Заявок</span></div>
        <div className="stat-card"><strong>{categories.count ?? 0}</strong><span>Категорий</span></div>
        <div className="stat-card"><strong>{matches.count ?? 0}</strong><span>Боёв</span></div>
        <div className="stat-card"><strong>{mats.count ?? 0}</strong><span>Ковров</span></div>
      </section>

      <section className="panel" id="participants"><h2>Участники</h2><p className="muted">Здесь будет управление заявками, оплатой, подтверждением и фильтрами.</p></section>
      <section className="panel" id="categories"><h2>Категории</h2><p className="muted">Создание и ручное распределение участников по категориям.</p></section>
      <section className="panel" id="brackets"><h2>Сетки</h2><p className="muted">Single Elimination и ручное редактирование пар.</p></section>
      <section className="panel" id="schedule"><h2>Расписание</h2><p className="muted">Распределение боёв по коврам и порядок проведения.</p></section>
      <section className="panel" id="mats"><h2>Ковры</h2><p className="muted">Добавьте Ковёр 1, Ковёр 2 и другие площадки.</p></section>
      <section className="panel" id="running"><h2>Проведение</h2><p className="muted">Быстрый режим судьи с фиксацией победителя и обновлением сетки.</p></section>
      <section className="panel" id="results"><h2>Результаты</h2><p className="muted">Итоговые места и результаты категорий.</p></section>
      <section className="panel" id="settings"><h2>Настройки</h2><p className="muted">Статус: {statusLabels[tournament.status] ?? tournament.status}. Публичность: {tournament.is_public ? "открыта" : "закрыта"}.</p></section>
    </main>
  );
}
