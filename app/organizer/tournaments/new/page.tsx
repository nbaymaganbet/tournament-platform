"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё\s-]/gi, "")
    .replace(/[а-яё]+/gi, (part) => part)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    date: "",
    city: "Астана",
    venue: "",
    sport: "MMA",
    description: "",
    entryFee: "0",
    registrationDeadline: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    let { data: organizer } = await supabase
      .from("organizers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!organizer) {
      const { data: createdOrganizer, error: organizerError } = await supabase
        .from("organizers")
        .insert({
          user_id: user.id,
          display_name: user.email ?? "Организатор",
        })
        .select("id")
        .single();

      if (organizerError || !createdOrganizer) {
        setError("Не удалось создать профиль организатора.");
        setSaving(false);
        return;
      }
      organizer = createdOrganizer;
    }

    const baseSlug = slugify(form.name) || `tournament-${Date.now()}`;
    const slug = `${baseSlug}-${Date.now().toString().slice(-6)}`;

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: organizer.id,
        name: form.name,
        slug,
        date: form.date,
        city: form.city,
        venue: form.venue || null,
        sport: form.sport,
        description: form.description || null,
        entry_fee: Number(form.entryFee) || 0,
        registration_deadline: form.registrationDeadline || null,
        status: "draft",
        is_public: false,
      })
      .select("id")
      .single();

    if (tournamentError || !tournament) {
      setError(tournamentError?.message ?? "Не удалось создать соревнование.");
      setSaving(false);
      return;
    }

    router.push(`/organizer/tournaments/${tournament.id}`);
  }

  return (
    <main className="container dashboard-page">
      <div className="page-topline">
        <a className="back-link" href="/organizer">← Мои соревнования</a>
      </div>
      <section className="form-card">
        <div className="eyebrow">НОВОЕ СОРЕВНОВАНИЕ</div>
        <h1>Создать соревнование</h1>
        <p className="muted">Сначала сохраняем основные данные. Остальные настройки можно добавить позже.</p>

        <form className="tournament-form" onSubmit={submit}>
          <label>Название<input className="field" value={form.name} onChange={(e) => update("name", e.target.value)} required /></label>
          <div className="form-grid">
            <label>Дата<input className="field" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required /></label>
            <label>Город<input className="field" value={form.city} onChange={(e) => update("city", e.target.value)} required /></label>
          </div>
          <div className="form-grid">
            <label>Вид спорта<input className="field" value={form.sport} onChange={(e) => update("sport", e.target.value)} required /></label>
            <label>Место проведения<input className="field" value={form.venue} onChange={(e) => update("venue", e.target.value)} /></label>
          </div>
          <div className="form-grid">
            <label>Взнос<input className="field" type="number" min="0" step="1" value={form.entryFee} onChange={(e) => update("entryFee", e.target.value)} /></label>
            <label>Дедлайн регистрации<input className="field" type="datetime-local" value={form.registrationDeadline} onChange={(e) => update("registrationDeadline", e.target.value)} /></label>
          </div>
          <label>Описание<textarea className="field textarea" rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} /></label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить черновик"}</button>
        </form>
      </section>
    </main>
  );
}
