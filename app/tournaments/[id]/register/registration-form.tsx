"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const fields = [
  ["first_name", "Имя", "text"], ["last_name", "Фамилия", "text"], ["age", "Возраст", "number"],
  ["weight", "Вес, кг", "number"], ["experience", "Опыт", "text"], ["phone", "Телефон", "tel"],
  ["club", "Клуб", "text"], ["coach", "Тренер", "text"],
] as const;

export default function RegistrationForm({ tournamentId }: { tournamentId: string }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ application: string; token: string } | null>(null);
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
    setResult({ application: data[0].application_number, token: data[0].status_token }); setBusy(false);
  }

  if (result) {
    const statusUrl = `/registration/status?token=${encodeURIComponent(result.token)}`;
    return <div className="success-card">
      <h2>Заявка принята</h2>
      <p>Номер заявки:</p>
      <strong className="application-number">{result.application}</strong>
      <p className="muted">Статус: Ожидает подтверждения.</p>
      <p className="muted">Ссылка ниже — ваш защищённый доступ к статусу заявки. Сохраните её.</p>
      <div className="button-row">
        <Link className="primary" href={statusUrl}>Открыть статус заявки</Link>
        <button className="secondary" type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${statusUrl}`)}>Скопировать ссылку</button>
      </div>
    </div>;
  }

  return <form className="form-grid" onSubmit={submit}>
    {fields.map(([key, label, type]) => <label key={key}>{label}{["first_name","last_name","age","weight","phone"].includes(key) && " *"}<input required={["first_name","last_name","age","weight","phone"].includes(key)} type={type} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
    {error && <div className="error-box">{error}</div>}
    <button className="primary submit-button" disabled={busy}>{busy ? "Отправка…" : "Подать заявку"}</button>
  </form>;
}
