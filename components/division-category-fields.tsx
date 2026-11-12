"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Limits = { age_min: number | null; age_max: number | null; weight_min: number | null; weight_limit: number | null; weight_allowance: number | null };

function defaultCategoryName(limits: Limits, kk: boolean) {
  const weightLabel = limits.weight_min == null
    ? `${kk ? "дейін" : "до"} ${limits.weight_limit}`
    : `${limits.weight_min}+`;
  return `${limits.age_min}–${limits.age_max} ${kk ? "жас" : "лет"} — ${weightLabel} кг`;
}

export default function DivisionCategoryFields({ category, kk, onSaved }: {
  category: Limits & { id: string; name: string };
  kk: boolean;
  onSaved: (limits: Limits & { name: string }) => void;
}) {
  const [ageMin, setAgeMin] = useState(String(category.age_min ?? ""));
  const [ageMax, setAgeMax] = useState(String(category.age_max ?? ""));
  const [weight, setWeight] = useState(String(category.weight_limit ?? category.weight_min ?? ""));
  const [allowance, setAllowance] = useState(String(Math.round((category.weight_allowance ?? 0) * 1000)));
  const [upTo, setUpTo] = useState(category.weight_min === null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const values = {
      age_min: Number(ageMin), age_max: Number(ageMax),
      weight_min: upTo ? null : Number(weight), weight_limit: upTo ? Number(weight) : null,
      weight_allowance: Number(allowance) / 1000,
    };
    const name = [false, true].some(inKazakh => defaultCategoryName(category, inKazakh) === category.name)
      ? defaultCategoryName(values, kk)
      : category.name;
    const { error } = await createClient().rpc("update_division_category_limits", {
      p_category_id: category.id, p_name: name, p_age_min: values.age_min, p_age_max: values.age_max,
      p_weight_min: values.weight_min, p_weight_limit: values.weight_limit, p_allowance: values.weight_allowance,
    });
    if (error) {
      setMessage(error.message.includes("weigh-in or brackets")
        ? kk ? "Салмақ өлшеуден немесе тор құрылғаннан кейін шектерді өзгерту мүмкін емес." : "Возраст и вес можно изменить до взвешивания и формирования сетки."
        : error.message);
    } else {
      onSaved({ ...values, name });
      setMessage(kk ? "Сақталды" : "Сохранено");
    }
    setSaving(false);
  }

  return <details>
    <summary>{kk ? "Жас пен салмақты өзгерту" : "Изменить возраст и вес"}</summary>
    <form className="form-grid" onSubmit={save}>
      <label>{kk ? "Жасы, бастап" : "Возраст от"}<input className="field" type="number" min={1} max={ageMax || undefined} required value={ageMin} onChange={(event) => setAgeMin(event.target.value)} /></label>
      <label>{kk ? "Жасы, дейін" : "Возраст до"}<input className="field" type="number" min={ageMin || 1} required value={ageMax} onChange={(event) => setAgeMax(event.target.value)} /></label>
      <label>{kk ? "Салмақ шегі" : "Граница веса"}<select className="field" value={upTo ? "up_to" : "from"} onChange={(event) => setUpTo(event.target.value === "up_to")}>
        <option value="up_to">{kk ? "Дейін" : "До"}</option><option value="from">{kk ? "Бастап" : "От"}</option>
      </select></label>
      <label>{kk ? "Салмақ, кг" : "Вес, кг"}<input className="field" type="number" min="0.1" step="0.1" required value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
      <label>{kk ? "Рұқсат, г" : "Допуск, г"}<input className="field" type="number" min="0" step="1" value={allowance} onChange={(event) => setAllowance(event.target.value)} /></label>
      <button className="secondary" type="submit" disabled={saving}>{kk ? "Сақтау" : "Сохранить"}</button>
      {message && <p role="status" className="muted">{message}</p>}
    </form>
  </details>;
}
