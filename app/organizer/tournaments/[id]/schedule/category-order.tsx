"use client";

import { useState } from "react";

export type ScheduleCategory = { id: string; name: string; ageMin: number; ageMax: number };

export default function CategoryOrder({ categories, savedOrder, youngerFirst, kk, disabled, onSave }: {
  categories: ScheduleCategory[];
  savedOrder: string[];
  youngerFirst: boolean;
  kk: boolean;
  disabled: boolean;
  onSave: (order: string[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<string[] | null>(null);
  const order = confirmedOrder ?? savedOrder;
  const [dragging, setDragging] = useState<string | null>(null);
  const names = new Map(categories.map(category => [category.id, category.name]));

  function open() {
    const remaining = categories.filter(category => !order.includes(category.id));
    if (youngerFirst) remaining.sort((a, b) => a.ageMin - b.ageMin || a.ageMax - b.ageMax);
    setDraft([...order.filter(id => names.has(id)), ...remaining.map(category => category.id)]);
  }

  function move(id: string, target: string) {
    setDraft(current => {
      if (!current || id === target || !current.includes(target)) return current;
      const next = current.filter(item => item !== id);
      next.splice(current.indexOf(target), 0, id);
      return next;
    });
  }

  async function save(order: string[]) {
    if (await onSave(order)) {
      setConfirmedOrder(order);
      setDraft(null);
    }
  }

  return <div className="schedule-category-order" data-live-paused={draft ? "true" : undefined}>
    <button className="secondary" type="button" aria-expanded={draft !== null} disabled={disabled}
      onClick={() => draft ? setDraft(null) : open()}>{kk ? "Санаттар реті" : "Порядок категорий"}</button>
    {draft && <>
      <ol>
        {draft.map((id, index) => <li key={id} data-schedule-category={id} data-dragging={dragging === id}>
          <button className="secondary drag" type="button" disabled={disabled}
            aria-label={kk ? "Санатты сүйреу" : "Перетащить категорию"}
            onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(id); }}
            onPointerCancel={() => setDragging(null)}
            onPointerUp={event => {
              const target = document.elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>("[data-schedule-category]")?.dataset.scheduleCategory;
              if (target) move(id, target);
              setDragging(null);
            }}>≡</button>
          <span>{names.get(id)}</span>
          <button className="secondary" type="button" aria-label={kk ? "Жоғары" : "Выше"}
            disabled={disabled || index === 0} onClick={() => move(id, draft[index - 1])}>↑</button>
          <button className="secondary" type="button" aria-label={kk ? "Төмен" : "Ниже"}
            disabled={disabled || index === draft.length - 1} onClick={() => move(id, draft[index + 1])}>↓</button>
        </li>)}
      </ol>
      <div className="actions">
        <button className="primary" type="button" disabled={disabled} onClick={() => void save(draft)}>{kk ? "Сақтау" : "Сохранить"}</button>
        <button className="secondary" type="button" disabled={disabled} onClick={() => setDraft(null)}>{kk ? "Бас тарту" : "Отмена"}</button>
        {order.length > 0 && <button className="secondary" type="button" disabled={disabled} onClick={() => void save([])}>
          {kk ? "Автоматты рет" : "Автоматический порядок"}
        </button>}
      </div>
    </>}
    <style jsx>{`
      .schedule-category-order { margin-top: 12px; }
      ol { padding: 0; margin: 8px 0; }
      li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 6px; align-items: center; padding: 4px 0; }
      li[data-dragging="true"] { opacity: .6; }
      li button { min-width: 36px; padding-inline: 8px; }
      .drag { touch-action: none; cursor: grab; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    `}</style>
  </div>;
}
