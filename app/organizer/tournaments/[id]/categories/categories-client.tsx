"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string; age_min: number | null; age_max: number | null; weight_limit: number | null; sort_order: number; participantCount: number };

export default function CategoriesClient({ tournamentId, initialCategories }: { tournamentId: string; initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState({ name: "", ageMin: "", ageMax: "", weight: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  async function createCategory(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const { data, error } = await supabase.from("categories").insert({ tournament_id: tournamentId, name: form.name.trim(), age_min: form.ageMin ? Number(form.ageMin) : null, age_max: form.ageMax ? Number(form.ageMax) : null, weight_limit: form.weight ? Number(form.weight) : null, sort_order: categories.length }).select("id,name,age_min,age_max,weight_limit,sort_order").single();
    if (error || !data) setError(error?.message ?? "Не удалось создать категорию.");
    else { setCategories((c) => [...c, { ...data, participantCount: 0 }]); setForm({ name: "", ageMin: "", ageMax: "", weight: "" }); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!window.confirm("Удалить категорию?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id).eq("tournament_id", tournamentId);
    if (!error) setCategories((c) => c.filter((x) => x.id !== id)); else setError(error.message);
  }

  return <section className="categories-workspace"><form className="form-card compact-form" onSubmit={createCategory}><h2>Новая категория</h2><div className="form-grid"><label>Название<input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="10–11 лет · 33 кг" /></label><label>Лимит веса<input className="field" type="number" min="0" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} /></label></div><div className="form-grid"><label>Возраст от<input className="field" type="number" min="0" value={form.ageMin} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} /></label><label>Возраст до<input className="field" type="number" min="0" value={form.ageMax} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} /></label></div>{error && <p className="error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Создаём…" : "Создать категорию"}</button></form><div className="category-list">{categories.length === 0 ? <div className="empty-state">Категорий пока нет.</div> : categories.map((c) => <article className="participant-card" key={c.id}><div className="participant-main"><div><strong>{c.name}</strong><span className="muted">{c.age_min ?? "—"}–{c.age_max ?? "—"} лет · до {c.weight_limit ?? "—"} кг · {c.participantCount} участников</span></div><button className="danger-button" onClick={() => remove(c.id)}>Удалить</button></div></article>)}</div></section>;
}
