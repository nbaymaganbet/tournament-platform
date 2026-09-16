"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-"); }

export default function NewTournamentPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", date: "", city: "Астана", venue: "", sport: "MMA", description: "", entryFee: "0", registrationDeadline: "" });
  const [poster, setPoster] = useState<File | null>(null);
  const [regulations, setRegulations] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    if (!form.name.trim() || !form.date || !form.city.trim() || !form.sport.trim()) { setError("Заполните название, дату, город и вид спорта."); setSaving(false); return; }
    let { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
    if (!organizer) {
      const { data: createdOrganizer, error: organizerError } = await supabase.from("organizers").insert({ user_id: user.id, display_name: user.email ?? "Организатор", email: user.email?.toLowerCase() ?? null }).select("id").single();
      if (organizerError || !createdOrganizer) { setError(organizerError?.message ?? "Не удалось создать профиль организатора."); setSaving(false); return; }
      organizer = createdOrganizer;
    }
    const slug = `${slugify(form.name) || "tournament"}-${Date.now().toString().slice(-6)}`;
    const { data: tournament, error: tournamentError } = await supabase.from("tournaments").insert({ organizer_id: organizer.id, name: form.name.trim(), slug, date: form.date, city: form.city.trim(), venue: form.venue.trim() || null, sport: form.sport.trim(), description: form.description.trim() || null, entry_fee: Number(form.entryFee) || 0, registration_deadline: form.registrationDeadline || null, status: "draft", is_public: false }).select("id").single();
    if (tournamentError || !tournament) { setError(tournamentError?.message ?? "Не удалось создать соревнование."); setSaving(false); return; }
    const uploadErrors: string[] = [];
    if (poster) { const path = `${organizer.id}/${tournament.id}/${Date.now()}-${poster.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const { error: uploadError } = await supabase.storage.from("posters").upload(path, poster, { upsert: true, contentType: poster.type || undefined }); if (uploadError) uploadErrors.push(`Афиша: ${uploadError.message}`); else { const { data: publicUrl } = supabase.storage.from("posters").getPublicUrl(path); await supabase.from("tournaments").update({ poster_url: publicUrl.publicUrl }).eq("id", tournament.id); } }
    if (regulations) { const path = `${organizer.id}/${tournament.id}/${Date.now()}-${regulations.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const { error: uploadError } = await supabase.storage.from("regulations").upload(path, regulations, { upsert: true, contentType: regulations.type || undefined }); if (uploadError) uploadErrors.push(`Положение: ${uploadError.message}`); else { const { data: publicUrl } = supabase.storage.from("regulations").getPublicUrl(path); const { error: docError } = await supabase.from("documents").insert({ tournament_id: tournament.id, name: regulations.name, storage_path: publicUrl.publicUrl, mime_type: regulations.type || null, is_public: true }); if (docError) uploadErrors.push(`Положение: ${docError.message}`); } }
    if (uploadErrors.length) { setError(`Черновик создан, но часть файлов не загрузилась. ${uploadErrors.join(" ")}`); setSaving(false); return; }
    router.push(`/organizer/tournaments/${tournament.id}`);
  }

  return <main className="container dashboard-page"><div className="page-topline"><a className="back-link" href="/organizer">← Мои соревнования</a></div><section className="form-card"><div className="eyebrow">НОВОЕ СОРЕВНОВАНИЕ</div><h1>Создать соревнование</h1><p className="muted">Основные данные и материалы турнира. Остальные настройки можно добавить позже.</p><form className="tournament-form" onSubmit={submit}><label>Название<input className="field" value={form.name} onChange={(e) => update("name", e.target.value)} required /></label><div className="form-grid"><label>Дата<input className="field" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} required /></label><label>Город<input className="field" value={form.city} onChange={(e) => update("city", e.target.value)} required /></label></div><div className="form-grid"><label>Вид спорта<input className="field" value={form.sport} onChange={(e) => update("sport", e.target.value)} required /></label><label>Место проведения<input className="field" value={form.venue} onChange={(e) => update("venue", e.target.value)} /></label></div><div className="form-grid"><label>Взнос<input className="field" type="number" min="0" step="1" value={form.entryFee} onChange={(e) => update("entryFee", e.target.value)} /></label><label>Дедлайн регистрации<input className="field" type="datetime-local" value={form.registrationDeadline} onChange={(e) => update("registrationDeadline", e.target.value)} /></label></div><label>Описание<textarea className="field textarea" rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} /></label><div className="form-grid"><label>Афиша<input className="field" type="file" accept="image/*" onChange={(e) => setPoster(e.target.files?.[0] ?? null)} /></label><label>Положение<input className="field" type="file" accept=".pdf,.doc,.docx" onChange={(e) => setRegulations(e.target.files?.[0] ?? null)} /></label></div>{error && <p className="error">{error}</p>}<button className="primary" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить черновик"}</button></form></section></main>;
}
