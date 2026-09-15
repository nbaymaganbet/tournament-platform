"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const fields = [
  ["first_name", "Имя", "text"], ["last_name", "Фамилия", "text"], ["age", "Возраст", "number"],
  ["weight", "Вес, кг", "number"], ["experience", "Опыт", "text"], ["phone", "Телефон", "tel"],
  ["club", "Клуб", "text"], ["coach", "Тренер", "text"],
] as const;

export default function RegistrationForm({ tournamentId }: { tournamentId: string }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const supabase = createClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const required = ["first_name", "last_name", "age", "weight", "phone"];
    if (required.some((key) => !form[key]?.trim())) { setError("Заполните обязательные поля."); setBusy(false); return; }
    const { data, error } = await supabase.rpc("submit_tournament_registration", {
      p_tournament_id: tournamentId, p_first_name: form.first_name.trim(), p_last_name: form.last_name.trim(),
      p_age: Number(form.age), p_weight: Number(form.weight), p_experience: form.experience?.trim() || null,
      p_phone: form.phone.trim(), p_club: form.club?.trim() || null, p_coach: form.coach?.trim() || null,
    });
    if (error || !data?.[0]) { setError(error?.message || "Не удалось создать заявку."); setBusy(false); return; }
    setResult(data[0].application_number); setBusy(false);
  }

  if (result) return <div className="success-card"><h2>Заявка принята</h2><p>Номер заявки:</p><strong className="application-number">{result}</strong><p className="muted">Статус: Ожидает подтверждения.</p><p className="muted">Сохраните номер заявки для проверки статуса.</p></div>;

  return <form className="form-grid" onSubmit={submit}>
    {fields.map(([key, label, type]) => <label key={key}>{label}{["first_name","last_name","age","weight","phone"].includes(key) && " *"}<input required={["first_name","last_name","age","weight","phone"].includes(key)} type={type} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
    {error && <div className="error-box">{error}</div>}
    <button className="primary submit-button" disabled={busy}>{busy ? "Отправка…" : "Подать заявку"}</button>
  </form>;
}
