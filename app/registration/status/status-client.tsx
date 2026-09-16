"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = {
  application_number: string;
  participant_name: string;
  tournament_name: string;
  tournament_id: string;
  registration_status: string;
  payment_status: string;
  category_name: string | null;
  match_number: number | null;
  round_number: number | null;
  match_status: string | null;
  mat_name: string | null;
  approximate_time: string | null;
};

const registrationLabels: Record<string,string> = { pending_confirmation: "Ожидает подтверждения", awaiting_payment: "Ожидает оплаты", payment_confirmed: "Оплата подтверждена", confirmed: "Подтверждена", category_formed: "Категория сформирована", withdrawn: "Снята" };
const paymentLabels: Record<string,string> = { unpaid: "Не оплачено", paid: "Оплачено" };
const matchLabels: Record<string,string> = { scheduled: "Запланирован", ready: "Готов к бою", running: "Идёт сейчас", completed: "Завершён" };

export default function StatusClient({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [data, setData] = useState<Status | null>(null);
  const [busy, setBusy] = useState(Boolean(initialToken));
  const [error, setError] = useState("");
  const supabase = createClient();

  async function load(value = token) {
    const clean = value.trim();
    if (!clean) { setError("Введите код доступа или откройте защищённую ссылку."); return; }
    setBusy(true); setError(""); setData(null);
    const { data: rows, error: rpcError } = await supabase.rpc("get_registration_status", { p_status_token: clean });
    if (rpcError || !rows?.[0]) setError(rpcError?.message || "Заявка не найдена. Проверьте ссылку или код доступа.");
    else setData(rows[0] as Status);
    setBusy(false);
  }

  useEffect(() => { if (initialToken) void load(initialToken); }, [initialToken]);

  return <section className="category-list">
    <div className="form-card"><label>Код доступа<input className="field" value={token} onChange={e => setToken(e.target.value)} placeholder="Вставьте код из ссылки" autoComplete="off" /></label><button className="primary" disabled={busy} onClick={() => void load()}>{busy ? "Проверяем…" : "Проверить статус"}</button>{error && <p className="error-box">{error}</p>}</div>
    {data && <article className="participant-card">
      <div className="participant-main"><strong>{data.participant_name}</strong><span>{data.application_number}</span></div>
      <div className="stats-grid">
        <div><span>Турнир</span><strong>{data.tournament_name}</strong></div>
        <div><span>Категория</span><strong>{data.category_name ?? "Пока не назначена"}</strong></div>
        <div><span>Заявка</span><strong>{registrationLabels[data.registration_status] ?? data.registration_status}</strong></div>
        <div><span>Оплата</span><strong>{paymentLabels[data.payment_status] ?? data.payment_status}</strong></div>
      </div>
      <div className="success-card"><h3>Ближайший бой</h3>{data.match_number ? <><p><strong>Бой #{data.match_number}</strong> · Раунд {data.round_number}</p><p>{matchLabels[data.match_status ?? ""] ?? data.match_status}</p>{data.mat_name && <p>Ковёр: <strong>{data.mat_name}</strong></p>}{data.approximate_time && <p>Ориентировочное время: <strong>{new Date(data.approximate_time).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</strong></p>}</> : <p className="muted">Бой и расписание появятся после формирования сетки и расписания.</p>}</div>
    </article>}
  </section>;
}
