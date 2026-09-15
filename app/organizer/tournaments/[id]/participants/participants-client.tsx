"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string;
  participant_id: string;
  application_number: string | null;
  status: string;
  payment_status: string;
  first_name: string;
  last_name: string;
  age: number;
  weight: number;
  experience: string | null;
  phone: string | null;
  club: string | null;
  coach: string | null;
};

const statuses = [
  ["pending_confirmation", "Ожидает подтверждения"],
  ["awaiting_payment", "Ожидает оплаты"],
  ["payment_confirmed", "Оплата подтверждена"],
  ["confirmed", "Заявка подтверждена"],
  ["category_formed", "Категория сформирована"],
  ["withdrawn", "Участник снят"],
] as const;

export default function ParticipantsClient({ tournamentId, initialRows }: { tournamentId: string; initialRows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const supabase = createClient();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesText = !q || [r.first_name, r.last_name, r.club, r.coach, r.application_number, r.phone]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
      return matchesText && (statusFilter === "all" || r.status === statusFilter);
    });
  }, [rows, query, statusFilter]);

  async function updateRegistration(id: string, patch: { status?: string; payment_status?: string }) {
    setBusy(id);
    const { data, error } = await supabase.from("registrations").update(patch).eq("id", id).eq("tournament_id", tournamentId).select("id,status,payment_status").single();
    if (!error && data) setRows((current) => current.map((r) => r.id === id ? { ...r, ...data } : r));
    if (error) window.alert(error.message);
    setBusy(null);
  }

  async function removeRegistration(id: string) {
    if (!window.confirm("Удалить заявку? Данные участника сохранятся.")) return;
    setBusy(id);
    const { error } = await supabase.from("registrations").delete().eq("id", id).eq("tournament_id", tournamentId);
    if (!error) setRows((current) => current.filter((r) => r.id !== id));
    if (error) window.alert(error.message);
    setBusy(null);
  }

  return (
    <div className="participants-workspace">
      <div className="toolbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: имя, клуб, тренер, номер..." />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Все статусы</option>
          {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="participants-list">
        {filtered.length === 0 ? <div className="empty-state">Заявок по выбранным условиям нет.</div> : filtered.map((r) => (
          <article className="participant-card" key={r.id}>
            <div className="participant-main">
              <div>
                <strong>{r.last_name} {r.first_name}</strong>
                <span className="muted">#{r.application_number ?? "—"} · {r.age} лет · {r.weight} кг</span>
              </div>
              <span className="status">{statuses.find(([v]) => v === r.status)?.[1] ?? r.status}</span>
            </div>
            <div className="participant-meta">
              <span>{r.club || "Клуб не указан"}</span><span>{r.coach ? `Тренер: ${r.coach}` : "Тренер не указан"}</span>
              <span>{r.experience || "Опыт не указан"}</span><span>{r.phone || "Телефон не указан"}</span>
              <span>Оплата: {r.payment_status === "paid" ? "подтверждена" : "не подтверждена"}</span>
            </div>
            <div className="participant-actions">
              <button disabled={busy === r.id} onClick={() => updateRegistration(r.id, { payment_status: r.payment_status === "paid" ? "unpaid" : "paid", status: r.payment_status === "paid" ? r.status : "payment_confirmed" })}>
                {r.payment_status === "paid" ? "Отменить оплату" : "Подтвердить оплату"}
              </button>
              <button disabled={busy === r.id} onClick={() => updateRegistration(r.id, { status: r.status === "confirmed" ? "pending_confirmation" : "confirmed" })}>
                {r.status === "confirmed" ? "Снять подтверждение" : "Подтвердить заявку"}
              </button>
              <button className="danger-button" disabled={busy === r.id} onClick={() => removeRegistration(r.id)}>Удалить</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
