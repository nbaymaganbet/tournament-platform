"use client";
import { divisionNames, type Division } from "@/lib/tournament-divisions";
import DivisionCategoryFields from "@/components/division-category-fields";
import CategoryTiming, {TimingFields,emptyTiming,type CategoryTimingValue} from "@/components/category-timing";
import { ActionScope, useActionFeedback } from "@/components/action-feedback";
import { uiText } from "@/lib/ui-text";

import { useLocale } from "@/components/locale-provider";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translations, type Locale } from "@/lib/i18n";

type Person = { id: string; first_name: string; last_name: string; age: number; weight: number; club: string | null; coach: string | null };
type Category = CategoryTimingValue & { id: string; name: string; age_min: number | null; age_max: number | null; weight_min: number | null; weight_limit: number | null; weight_allowance: number | null; sort_order: number; bracket_format: string | null; participantCount: number };
type WeightRow = { type: "up_to" | "from"; weight: string; allowance: string };

export default function CategoriesClient({ tournamentId, division, divisions, defaultFormat, configurable, initialCategories, participants, initialAssignments }: { tournamentId: string; division: string; divisions: Division[]; defaultFormat: string; configurable: boolean; initialCategories: Category[]; participants: Person[]; initialAssignments: Record<string, string[]> }) {
 const L = (text: string) => uiText(locale, text);

  const locale = useLocale();
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
  const [newTiming,setNewTiming]=useState<CategoryTimingValue>(emptyTiming);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const supabase = createClient();

  const action = useActionFeedback(() => { setBusy(null); });
 async function setFormat(category: Category, value: string) { return action.run(async () => {
    if (value === (category.bracket_format ?? defaultFormat)) return;
    if (!window.confirm(locale === "kk" ? "Егер тор құрылса, жекпе-жектер мен уақыты қайта құрылады. Жалғастыру керек пе?" : "Если сетка уже сформирована, бои категории и их время будут пересобраны. Продолжить?")) return;
    setBusy(`format:${category.id}`);
    setError("");
    const { error: updateError } = await supabase.rpc("set_category_bracket_format", { p_category_id: category.id, p_format: value });
    if (updateError) setError(updateError.message);
    else setCategories(rows => rows.map(row => row.id === category.id ? { ...row, bracket_format: value } : row));
    setBusy(null);
   }); }

  useEffect(()=>{if(!busy&&!showForm){setCategories(initialCategories);setAssigned(initialAssignments)}},[initialCategories,initialAssignments]);
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

  const [targets,setTargets]=useState<Division[]>(divisions.filter(item=>item===division));
  async function copyCategories(target:Division) { return action.run(async()=>{
    setBusy("copy");setError("");
    const {error}=await supabase.rpc("copy_division_categories",{p_tournament_id:tournamentId,p_from:division,p_to:target});
    if(error)setError(error.message);
    setBusy(null);
  }); }

  async function createCategory(e: React.FormEvent) { e.preventDefault(); return action.run(async () => {
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

    if(division && !targets.length){setError(locale==="kk"?"Жарыс бөлімін таңдаңыз.":"Выберите раздел.");setBusy(null);return;}
    const nextSort = categories.reduce((max, category) => Math.max(max, category.sort_order), -1) + 1;
    const rowsToInsert = validRows.map((row, index) => {
      const weight = Number(row.weight);
      const allowance = row.allowance ? Number(row.allowance) : 0;
      const name = row.type === "up_to"
        ? `${ageGroup.min}–${ageGroup.max} ${locale === "kk" ? "жас" : "лет"} — ${labels.upToPreview} ${weight} кг`
        : `${ageGroup.min}–${ageGroup.max} ${locale === "kk" ? "жас" : "лет"} — ${weight}+ кг`;
      return {
        ...newTiming,
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

    const { data, error: insertError } = await supabase.from("categories").insert((division?targets:[""]).flatMap(division=>rowsToInsert.map(row=>({...row,division})))).select("division,id,name,age_min,age_max,weight_min,weight_limit,weight_allowance,sort_order,bracket_format,round_seconds,round_count,round_rest_seconds").order("sort_order");
    if (insertError || !data) {
      setError(insertError?.message ?? t.errorGeneric);
    } else {
      setCategories(c => [...c, ...data.filter(category=>category.division===division).map(category => ({ ...category, participantCount: 0 }))]);
      setAgeGroup({ min: "", max: "" });
      setWeights([{ type: "up_to", weight: "", allowance: "" }]);
      setShowForm(false);
    }
    setBusy(null);
   }); }

  async function remove(id: string) { return action.run(async () => {
    const warning = locale === "kk"
      ? "Санатты жою керек пе? Қатысушылар жарыста қалады, бірақ оларды басқа санаттарға бөлу қажет болады. Осы санаттың торы, жекпе-жектері және нәтижелері (бар болса) жойылады."
      : "Удалить категорию? Участники останутся в турнире, но их потребуется распределить по другим категориям. Сетка, поединки и результаты этой категории (если есть) будут удалены.";
    if (!window.confirm(warning)) return;
    setBusy(`delete:${id}`);
    setError("");
    const { error } = await supabase.rpc("delete_tournament_category", { p_category_id: id });
    if (!error) {
      setCategories(c => c.filter(x => x.id !== id));
      setAssigned(rows => Object.fromEntries(Object.entries(rows).map(([person, categoryIds]) => [person, categoryIds.filter(categoryId => categoryId !== id)])));
      if (selectedCategory === id) setSelectedCategory("");
    } else setError(error.message);
    setBusy(null);
   }); }

  async function unassign(participantId: string) { return action.run(async () => {
    const categoryId = selectedCategory;
    if (!categoryId) return;
    setBusy(`unassign:${participantId}`);
    setError("");
    const { error } = await supabase.from("category_participants").update({ is_active: false }).eq("category_id", categoryId).eq("participant_id", participantId);
    if (error) { setError(error.message); setBusy(null); return; }
    setAssigned(x => ({ ...x, [participantId]: (x[participantId] ?? []).filter(id => id !== categoryId) }));
    setCategories(x => x.map(c => c.id === categoryId ? { ...c, participantCount: Math.max(0, c.participantCount - 1) } : c));
    setBusy(null);
   }); }

  const categoryParticipants = useMemo(() => selectedCategory ? participants.filter(p => assigned[p.id]?.includes(selectedCategory)) : [], [participants, assigned, selectedCategory]);

  return <ActionScope pending={action.pending} error={action.error} paused={showForm}>{<section className="categories-workspace">
    {!showForm && division && divisions.filter(item=>item!==division).map(item=><button key={item} type="button" className="secondary" disabled={busy!==null||!categories.length} onClick={()=>void copyCategories(item)}>{locale==="kk"?`Санаттарды ${divisionNames[item]} бөліміне көшіру`:`Скопировать категории в ${divisionNames[item]}`}</button>)}
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
                <label>{L("Тип\n                  ")}<select className="field" value={row.type} onChange={e => updateWeight(index, { type: e.target.value as WeightRow["type"] })}>
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

        {division&&<fieldset><legend>{locale==="kk"?"Қай бөлімге қосу керек":"Куда добавить"}</legend>{divisions.map(item=><label className="checkbox-row" key={item}><input type="checkbox" checked={targets.includes(item)} onChange={event=>setTargets(current=>event.target.checked?[...current,item]:current.filter(value=>value!==item))}/>{divisionNames[item]}</label>)}</fieldset>}
        <TimingFields value={newTiming} onChange={setNewTiming} kk={locale==="kk"} disabled={busy!==null}/>
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
                {division&&<DivisionCategoryFields key={c.id} category={c} kk={locale==="kk"} onSaved={value=>setCategories(rows=>rows.map(row=>row.id===c.id?{...row,...value}:row))}/>}
                <CategoryTiming key={c.id} category={c} kk={locale==="kk"} onSaved={value=>setCategories(rows=>rows.map(row=>row.id===c.id?{...row,...value}:row))}/>
                {configurable && <label style={{display:"block",marginBottom:16}}>{locale === "kk" ? "Тор форматы" : "Формат сетки"}
                  <select className="field" value={c.bracket_format ?? defaultFormat} disabled={busy !== null} onChange={e => void setFormat(c,e.target.value)}>
                    <option value="single_elimination">{locale === "kk" ? "Олимпиадалық" : "Олимпийская"}</option>
                    <option value="round_robin">{locale === "kk" ? "Айналмалы" : "Круговая"}</option>
                  </select>
                  <span className="muted">{locale === "kk" ? "Турнирдің әдепкі форматы. Жекпе-жек басталғанша өзгертуге болады." : "По умолчанию действует формат турнира. Можно изменить до начала боёв."}</span>
                </label>}
                <h2>{labels.details}</h2><p className="muted">{labels.info}</p>
                {categoryParticipants.length === 0 ? <div className="empty-state">{t.noFreeParticipants}</div> : <div className="participants-list">{categoryParticipants.map(p => <article className="participant-card" key={p.id}><div className="participant-main"><div><strong>{p.last_name} {p.first_name}</strong><span className="muted">{labels.declared}: {p.weight} {labels.kg} · {p.age} {t.years} · {p.club || t.clubNotSet}{p.coach ? ` · ${p.coach}` : ""}</span></div><button type="button" className="danger-button" disabled={busy !== null} onClick={() => void unassign(p.id)}>{t.remove}</button></div></article>)}</div>}
              </div>}
            </article>;
          })}
        </div>}
      </section>)}
    </div>
  </section>}</ActionScope>;
}

