"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translations, type Locale } from "@/lib/i18n";

type Person = { id: string; first_name: string; last_name: string; age: number; weight: number; club: string | null; coach: string | null };
type Category = { id: string; name: string; age_min: number | null; age_max: number | null; weight_min: number | null; weight_limit: number | null; weight_allowance: number | null; sort_order: number; participantCount: number };
type WeightRow = { type: "up_to" | "from"; weight: string; allowance: string };

export default function CategoriesClient({ tournamentId, initialCategories, participants, initialAssignments }: { tournamentId: string; initialCategories: Category[]; participants: Person[]; initialAssignments: Record<string, string> }) {
  const [locale] = useState<Locale>(() => typeof window !== "undefined" && localStorage.getItem("tp-lang") === "kk" ? "kk" : "ru");
  const t = translations[locale];
  const labels = locale === "kk"
    ? { allowance: "Рұқсат", preview: "Санат атауы", previewEmpty: "Жас тобын және салмақты көрсетіңіз", details: "Санат қатысушылары", info: "Санатқа бекітілген қатысушылар тізімі.", declared: "Мәлімделген салмақ", kg: "кг", open: "Ашу", close: "Жабу", add: "Санат қосу", cancel: "Бас тарту", ageGroup: "Жас тобы", weightCategories: "Салмақ санаттары", addWeight: "Салмақ санатын қосу", removeWeight: "Жою", upTo: "Дейін", from: "Бастап және жоғары", weight: "Салмақ", fromPreview: "және жоғары", upToPreview: "дейін" }
    : { allowance: "Допуск", preview: "Название категории", previewEmpty: "Укажите возрастную группу и вес", details: "Участники категории", info: "Список участников, закреплённых за этой категорией.", declared: "Заявленный вес", kg: "кг", open: "Открыть", close: "Закрыть", add: "Добавить категорию", cancel: "Отмена", ageGroup: "Возрастная группа", weightCategories: "Весовые категории", addWeight: "Добавить весовую категорию", removeWeight: "Удалить", upTo: "До", from: "От и выше", weight: "Вес", fromPreview: "и выше", upToPreview: "до" };

  const [categories, setCategories] = useState(initialCategories);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [openAgeGroups, setOpenAgeGroups] = useState<Record<string, boolean>>({});
  const [assigned, setAssigned] = useState(initialAssignments);
  const [ageGroup, setAgeGroup] = useState({ min: "", max: "" });
  const [weights, setWeights] = useState<WeightRow[]>([{ type: "up_to", weight: "", allowance: "" }]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const supabase = createClient();

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, { ageMin: number | null; ageMax: number | null; categories: Category[] }>();
    for (const category of categories) {
      const key = `${category.age_min ?? ""}:${category.age_max ?? ""}`;
      const existing = groups.get(key);
      if (existing) existing.categories.push(category);
      else groups.set(key, { ageMin: category.age_min, ageMax: category.age_max, categories: [category] });
    }
    return Array.from(groups.values());
  }, [categories]);

  const weightPreview = (row: WeightRow) => {
    if (!row.weight) return labels.previewEmpty;
    return row.type === "up_to" ? `${labels.upToPreview} ${row.weight} кг` : `${row.weight}+ кг`;
  };

  function updateWeight(index: number, patch: Partial<WeightRow>) {
    setWeights(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    setBusy("category");
    setError("");
    if (!ageGroup.min || !ageGroup.max || Number(ageGroup.min) > Number(ageGroup.max)) {
      setError(locale === "kk" ? "Жас аралығын дұрыс көрсетіңіз." : "Укажите корректный возрастной диапазон.");
      setBusy(null);
      return;
    }
    const validRows = weights.filter(row => row.weight && Number(row.weight) > 0);
    if (!validRows.length) {
      setError(locale === "kk" ? "Кемінде бір салмақ санатын қосыңыз." : "Добавьте хотя бы одну весовую категорию.");
      setBusy(null);
      return;
    }

    const nextSort = categories.reduce((max, category) => Math.max(max, category.sort_order), -1) + 1;
    const rowsToInsert = validRows.map((row, index) => {
      const weight = Number(row.weight);
      const allowance = row.allowance ? Number(row.allowance) : 0;
      const name = row.type === "up_to"
        ? `${ageGroup.min}–${ageGroup.max} ${locale === "kk" ? "жас" : "лет"} — ${labels.upToPreview} ${weight} кг`
        : `${ageGroup.min}–${ageGroup.max} ${locale === "kk" ? "жас" : "лет"} — ${weight}+ кг`;
      return {
        tournament_id: tournamentId,
        name,
        age_min: Number(ageGroup.min),
        age_max: Number(ageGroup.max),
        weight_min: row.type === "from" ? weight : null,
        weight_limit: row.type === "up_to" ? weight : null,
        weight_allowance: allowance,
        sort_order: nextSort + index,
      };
    });

    const { data, error: insertError } = await supabase.from("categories").insert(rowsToInsert).select("id,name,age_min,age_max,weight_min,weight_limit,weight_allowance,sort_order").order("sort_order");
    if (insertError || !data) {
      setError(insertError?.message ?? t.errorGeneric);
    } else {
      setCategories(c => [...c, ...data.map(category => ({ ...category, participantCount: 0 }))]);
      setAgeGroup({ min: "", max: "" });
      setWeights([{ type: "up_to", weight: "", allowance: "" }]);
      setShowForm(false);
    }
    setBusy(null);
  }

  async function remove(id: string) {
    if (!window.confirm(t.deleteCategory)) return;
    setBusy(`delete:${id}`);
    const { error } = await supabase.from("categories").delete().eq("id", id).eq("tournament_id", tournamentId);
    if (!error) {
      setCategories(c => c.filter(x => x.id !== id));
      if (selectedCategory === id) setSelectedCategory("");
    } else setError(error.message);
    setBusy(null);
  }

  async function assign(participantId: string, targetCategory: string) {
    if (!targetCategory) return;
    setBusy(`assign:${participantId}`);
    setError("");
    const existing = assigned[participantId];
    if (existing === targetCategory) { setBusy(null); return; }
    if (existing) {
      const { error } = await supabase.from("category_participants").update({ is_active: false }).eq("category_id", existing).eq("participant_id", participantId);
      if (error) { setError(error.message); setBusy(null); return; }
    }
    const { data: existingRow } = await supabase.from("category_participants").select("category_id").eq("category_id", targetCategory).eq("participant_id", participantId).maybeSingle();
    let error;
    if (existingRow) {
      ({ error } = await supabase.from("category_participants").update({ is_active: true, weigh_in_status: "pending", weigh_in_weight: null }).eq("category_id", targetCategory).eq("participant_id", participantId));
    } else {
      ({ error } = await supabase.from("category_participants").insert({ category_id: targetCategory, participant_id: participantId, is_active: true, weigh_in_status: "pending" }));
    }
    if (error) { setError(error.message); setBusy(null); return; }
    setAssigned(x => ({ ...x, [participantId]: targetCategory }));
    setCategories(x => x.map(c => c.id === targetCategory ? { ...c, participantCount: c.participantCount + 1 } : existing === c.id ? { ...c, participantCount: Math.max(0, c.participantCount - 1) } : c));
    setBusy(null);
  }

  async function unassign(participantId: string) {
    const categoryId = assigned[participantId];
    if (!categoryId) return;
    setBusy(`unassign:${participantId}`);
    setError("");
    const { error } = await supabase.from("category_participants").update({ is_active: false }).eq("category_id", categoryId).eq("participant_id", participantId);
    if (error) { setError(error.message); setBusy(null); return; }
    setAssigned(x => { const next = { ...x }; delete next[participantId]; return next; });
    setCategories(x => x.map(c => c.id === categoryId ? { ...c, participantCount: Math.max(0, c.participantCount - 1) } : c));
    setBusy(null);
  }

  const categoryParticipants = useMemo(() => selectedCategory ? participants.filter(p => assigned[p.id] === selectedCategory) : [], [participants, assigned, selectedCategory]);

  return <section className="categories-workspace">
    {!showForm ? <button type="button" className="primary" onClick={() => { setError(""); setShowForm(true); }} disabled={busy !== null}>+ {labels.add}</button> :
      <form className="form-card compact-form" onSubmit={createCategory} style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0 }}>{labels.add}</h2>
          <button type="button" className="secondary" onClick={() => setShowForm(false)} disabled={busy !== null}>{labels.cancel}</button>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 10px" }}>{labels.ageGroup}</h3>
          <div className="form-grid">
            <label>{t.ageFrom}<input className="field" type="number" min="0" required value={ageGroup.min} onChange={e => setAgeGroup({ ...ageGroup, min: e.target.value })} /></label>
            <label>{t.ageTo}<input className="field" type="number" min="0" required value={ageGroup.max} onChange={e => setAgeGroup({ ...ageGroup, max: e.target.value })} /></label>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <h3 style={{ margin: 0 }}>{labels.weightCategories}</h3>
            <button type="button" className="secondary" onClick={() => setWeights(rows => [...rows, { type: "up_to", weight: "", allowance: "" }])} disabled={busy !== null}>+ {labels.addWeight}</button>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {weights.map((row, index) => <div className="form-card" key={index} style={{ padding: 12 }}>
              <div className="form-grid">
                <label>Тип
                  <select className="field" value={row.type} onChange={e => updateWeight(index, { type: e.target.value as WeightRow["type"] })}>
                    <option value="up_to">{labels.upTo}</option>
                    <option value="from">{labels.from}</option>
                  </select>
                </label>
                <label>{labels.weight}, {labels.kg}<input className="field" type="number" min="0" step="0.1" required value={row.weight} onChange={e => updateWeight(index, { weight: e.target.value })} /></label>
                <label>{labels.allowance}, {labels.kg}<input className="field" type="number" min="0" step="0.1" value={row.allowance} onChange={e => updateWeight(index, { allowance: e.target.value })} placeholder="0" /></label>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>{labels.preview}: <strong>{ageGroup.min && ageGroup.max && row.weight ? `${ageGroup.min}–${ageGroup.max} ${locale === "kk" ? "жас" : "лет"} — ${weightPreview(row)}` : labels.previewEmpty}</strong></div>
              {weights.length > 1 && <button type="button" className="danger-button" style={{ marginTop: 8 }} onClick={() => setWeights(rows => rows.filter((_, i) => i !== index))} disabled={busy !== null}>{labels.removeWeight}</button>}
            </div>)}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy !== null} style={{ marginTop: 14 }}>{busy === "category" ? t.creating : t.createCategory}</button>
      </form>}

    {error && !showForm && <p className="error">{error}</p>}

    <div className="category-list" style={{ marginTop: 12 }}>
      {categories.length === 0 ? <div className="empty-state">{t.noCategories}</div> : groupedCategories.map(group => <section key={`${group.ageMin}:${group.ageMax}`} className="form-card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0 }}>{group.ageMin ?? "—"}–{group.ageMax ?? "—"} {t.years}</h2>
          <button type="button" className="secondary" disabled={busy !== null} onClick={() => setOpenAgeGroups(x => ({ ...x, [`${group.ageMin}:${group.ageMax}`]: !x[`${group.ageMin}:${group.ageMax}`] }))}>
            {openAgeGroups[`${group.ageMin}:${group.ageMax}`] ? labels.close : labels.open}
          </button>
        </div>
        {openAgeGroups[`${group.ageMin}:${group.ageMax}`] && <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {group.categories.map(c => {
            const open = selectedCategory === c.id;
            return <article className="participant-card" key={c.id}>
              <div className="participant-main">
                <div>
                  <strong>{c.name}</strong>
                  <span className="muted">{c.weight_min != null ? `${labels.from} ${c.weight_min} ${labels.kg}` : `${labels.upTo} ${c.weight_limit ?? "—"} ${labels.kg}`} · {labels.allowance.toLowerCase()} +{c.weight_allowance ?? 0} {labels.kg} · {c.participantCount} {t.participantsCount}</span>
                </div>
                <div className="participant-actions">
                  <button type="button" className={open ? "primary" : "secondary"} disabled={busy !== null} onClick={() => setSelectedCategory(open ? "" : c.id)}>{open ? labels.close : labels.open}</button>
                  <button type="button" className="danger-button" disabled={busy !== null} onClick={() => void remove(c.id)}>{t.delete}</button>
                </div>
              </div>
              {open && <div className="form-card" style={{ marginTop: 16 }}>
                <h2>{labels.details}</h2><p className="muted">{labels.info}</p>
                {categoryParticipants.length === 0 ? <div className="empty-state">{t.noFreeParticipants}</div> : <div className="participants-list">{categoryParticipants.map(p => <article className="participant-card" key={p.id}><div className="participant-main"><div><strong>{p.last_name} {p.first_name}</strong><span className="muted">{labels.declared}: {p.weight} {labels.kg} · {p.age} {t.years} · {p.club || t.clubNotSet}{p.coach ? ` · ${p.coach}` : ""}</span></div><button type="button" className="danger-button" disabled={busy !== null} onClick={() => void unassign(p.id)}>{t.remove}</button></div></article>)}</div>}
              </div>}
            </article>;
          })}
        </div>}
      </section>)}
    </div>
  </section>;
}
