"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Person = { id: string; first_name: string; last_name: string; age: number; weight: number; club: string | null; coach: string | null };
type Category = { id: string; name: string; age_min: number | null; age_max: number | null; weight_limit: number | null; sort_order: number; participantCount: number };

export default function CategoriesClient({ tournamentId, initialCategories, participants, initialAssignments }: { tournamentId: string; initialCategories: Category[]; participants: Person[]; initialAssignments: Record<string, string> }) {
  const [categories, setCategories] = useState(initialCategories);
  const [selectedCategory, setSelectedCategory] = useState(initialCategories[0]?.id ?? "");
  const [assigned, setAssigned] = useState<Record<string, string>>(initialAssignments);
  const [form, setForm] = useState({ name: "", ageMin: "", ageMax: "", weight: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  async function createCategory(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const { data, error } = await supabase.from("categories").insert({ tournament_id: tournamentId, name: form.name.trim(), age_min: form.ageMin ? Number(form.ageMin) : null, age_max: form.ageMax ? Number(form.ageMax) : null, weight_limit: form.weight ? Number(form.weight) : null, sort_order: categories.length }).select("id,name,age_min,age_max,weight_limit,sort_order").single();
    if (error || !data) setError(error?.message ?? "Не удалось создать категорию.");
    else { setCategories((c) => [...c, { ...data, participantCount: 0 }]); setSelectedCategory(data.id); setForm({ name: "", ageMin: "", ageMax: "", weight: "" }); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!window.confirm("Удалить категорию?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id).eq("tournament_id", tournamentId);
    if (!error) { setCategories((c) => c.filter((x) => x.id !== id)); if (selectedCategory === id) setSelectedCategory(categories.find((x) => x.id !== id)?.id ?? ""); } else setError(error.message);
  }

  async function assign(participantId: string) {
    if (!selectedCategory) return;
    setBusy(true); setError("");
    const existing = assigned[participantId];
    if (existing === selectedCategory) { setBusy(false); return; }
    if (existing) {
      const { error } = await supabase.from("category_participants").delete().eq("category_id", existing).eq("participant_id", participantId);
      if (error) { setError(error.message); setBusy(false); return; }
    }
    const { error } = await supabase.from("category_participants").insert({ category_id: selectedCategory, participant_id: participantId });
    if (error) { setError(error.message); setBusy(false); return; }
    setAssigned((x) => ({ ...x, [participantId]: selectedCategory }));
    setCategories((x) => x.map((c) => c.id === selectedCategory ? { ...c, participantCount: c.participantCount + 1 } : existing === c.id ? { ...c, participantCount: Math.max(0, c.participantCount - 1) } : c));
    setBusy(false);
  }

  async function unassign(participantId: string) {
    const categoryId = assigned[participantId];
    if (!categoryId) return;
    setBusy(true); setError("");
    const { error } = await supabase.from("category_participants").delete().eq("category_id", categoryId).eq("participant_id", participantId);
    if (error) { setError(error.message); setBusy(false); return; }
    setAssigned((x) => { const next = { ...x }; delete next[participantId]; return next; });
    setCategories((x) => x.map((c) => c.id === categoryId ? { ...c, participantCount: Math.max(0, c.participantCount - 1) } : c));
    setBusy(false);
  }

  const visibleParticipants = useMemo(() => participants.filter((p) => !assigned[p.id] || assigned[p.id] === selectedCategory), [participants, assigned, selectedCategory]);
  const selected = categories.find((c) => c.id === selectedCategory);

  return <section className="categories-workspace">
    <form className="form-card compact-form" onSubmit={createCategory}><h2>Новая категория</h2><div className="form-grid"><label>Название<input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="10–11 лет · 33 кг" /></label><label>Лимит веса<input className="field" type="number" min="0" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></label></div><div className="form-grid"><label>Возраст от<input className="field" type="number" min="0" value={form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} /></label><label>Возраст до<input className="field" type="number" min="0" value={form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} /></label></div>{error && <p className="error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Создаём…" : "Создать категорию"}</button></form>
    <div className="category-list">{categories.length === 0 ? <div className="empty-state">Категорий пока нет.</div> : categories.map((c) => <article className="participant-card" key={c.id}><div className="participant-main"><div><strong>{c.name}</strong><span className="muted">{c.age_min ?? "—"}–{c.age_max ?? "—"} лет · до {c.weight_limit ?? "—"} кг · {c.participantCount} участников</span></div><div className="participant-actions"><button className={selectedCategory === c.id ? "primary" : ""} onClick={() => setSelectedCategory(c.id)}>Открыть</button><button className="danger-button" onClick={() => remove(c.id)}>Удалить</button></div></div></article>)}</div>
    {selected && <div className="form-card"><h2>Участники: {selected.name}</h2><p className="muted">Добавляйте и убирайте подтверждённых участников вручную. Автоматического распределения нет.</p>{visibleParticipants.length === 0 ? <div className="empty-state">Свободных подтверждённых участников нет.</div> : <div className="participants-list">{visibleParticipants.map((p) => { const inCategory = assigned[p.id] === selectedCategory; return <article className="participant-card" key={p.id}><div className="participant-main"><div><strong>{p.last_name} {p.first_name}</strong><span className="muted">{p.age} лет · {p.weight} кг · {p.club || "Клуб не указан"}{p.coach ? ` · ${p.coach}` : ""}</span></div><button disabled={busy} className={inCategory ? "danger-button" : "primary"} onClick={() => inCategory ? unassign(p.id) : assign(p.id)}>{inCategory ? "Убрать" : "Добавить"}</button></div></article>; })}</div>}
      {selected.participantCount < 2 && <p className="muted">В категории меньше 2 участников — сетку пока формировать не стоит.</p>}
    </div>}
  </section>;
}
