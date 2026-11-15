"use client";

import { useState } from "react";
import { useActionFeedback } from "@/components/action-feedback";
import { useLocale } from "@/components/locale-provider";
import { createClient } from "@/lib/supabase/client";

export type ZoneCategory = { id: string; name: string; preferred_mat_id: string | null };
type Zone = { id: string; name: string; is_active: boolean };

export default function CategoryZones({ mat, mats, categories, onSaved }: {
  mat: Zone;
  mats: Zone[];
  categories: ZoneCategory[];
  onSaved: (changes: { id: string; assigned: boolean }[]) => void;
}) {
  const kk = useLocale() === "kk";
  const [draft, setDraft] = useState<{ checked: string[]; original: ZoneCategory[] } | null>(null);
  const [message, setMessage] = useState("");
  const action = useActionFeedback();
  const assigned = categories.filter(category => category.preferred_mat_id === mat.id);

  async function save() {
    if (!draft) return;
    const changes = draft.original.flatMap(category => {
      const checked = draft.checked.includes(category.id);
      return checked === (category.preferred_mat_id === mat.id) ? [] : [{
        id: category.id, assigned: checked, previous_mat_id: category.preferred_mat_id,
      }];
    });
    const moving = changes.filter(change => change.assigned && change.previous_mat_id);
    if (moving.length) {
      const names = moving.map(change => categories.find(category => category.id === change.id)?.name).join("\n");
      if (!window.confirm(kk ? `Осы санаттарды «${mat.name}» аймағына ауыстыру керек пе?\n${names}` : `Перенести эти категории на ковёр «${mat.name}»?\n${names}`)) return;
    }
    if (!changes.length) { setDraft(null); return; }
    await action.run(async () => {
      setMessage("");
      const { error } = await createClient().rpc("save_mat_categories", { p_mat_id: mat.id, p_changes: changes });
      if (error) { setMessage(error.message); return; }
      onSaved(changes);
      setDraft(null);
    });
  }

  return <div style={{ marginTop: 10 }} data-live-paused={draft ? "true" : undefined}>
    {assigned.length > 0 && <ul>{assigned.map(category => <li key={category.id}>{category.name}</li>)}</ul>}
    {!draft && mat.is_active && categories.length > 0 && <button className="secondary" type="button" disabled={action.pending}
      aria-expanded={draft !== null} onClick={() => { setMessage(""); setDraft(draft ? null : { checked: assigned.map(category => category.id), original: categories }); }}>
      {kk ? "Санаттарды тағайындау" : "Назначить категории"}
    </button>}
    {draft && <fieldset className="tp-action-scope" disabled={action.pending}>
      <div className="category-zone-list" role="group" aria-label={kk ? "Санаттар" : "Категории"}>
      {categories.map(category => {
        const other = mats.find(zone => zone.id !== mat.id && zone.id === category.preferred_mat_id);
        return <label className="checkbox-row" key={category.id}>
          <input type="checkbox" checked={draft.checked.includes(category.id)} onChange={event => {
            const checked = event.target.checked;
            setDraft(current => current && { ...current, checked: checked ? [...current.checked, category.id] : current.checked.filter(id => id !== category.id) });
          }} />
          <span>{category.name}{other && <small className="muted"> · {other.name}</small>}</span>
        </label>;
      })}
      </div>
      <div className="category-zone-actions">
        <button className="primary" type="button" onClick={() => void save()}>{kk ? "Сақтау" : "Сохранить"}</button>
        <button className="secondary" type="button" onClick={() => { setDraft(null); setMessage(""); }}>{kk ? "Бас тарту" : "Отмена"}</button>
      </div>
      <style jsx>{`
        .category-zone-list { max-height: min(40dvh, 22rem); overflow-y: auto; }
        .category-zone-list label { margin: 0; padding: 6px 0; min-height: 40px; }
        .category-zone-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      `}</style>
    </fieldset>}
    {(message || action.error) && <p className="error" role="alert">{message || action.error}</p>}
  </div>;
}
