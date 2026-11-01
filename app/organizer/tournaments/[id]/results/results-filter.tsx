"use client";

import { useState } from "react";
import ResultCategory, { type ResultAthlete } from "@/components/result-category";
import type { Locale } from "@/lib/i18n";

type ReadyCategory = { id: string; name: string; athletes: ResultAthlete[] };

export default function ResultsFilter({ tournamentId, tournamentName, groups, locale, share }: {
  tournamentId: string; tournamentName: string; groups: ReadyCategory[]; locale: Locale; share: boolean;
}) {
  const [selected, setSelected] = useState("");
  const ready = groups.filter(group => group.athletes.length > 0);
  const value = ready.some(group => group.id === selected) ? selected : "";
  const visible = value ? ready.filter(group => group.id === value) : ready;
  const kk = locale === "kk";

  return <>
    <label style={{ display: "grid", gap: 6, marginBottom: 18 }}>
      <span>{kk ? "Санат" : "Категория"}</span>
      <select className="field" value={value} onChange={event => setSelected(event.target.value)}>
        <option value="">{kk ? "Барлық дайын нәтижелер" : "Все готовые результаты"}</option>
        {ready.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
    </label>
    {visible.map(group => <ResultCategory key={group.id} tournamentId={tournamentId} tournamentName={tournamentName}
      categoryId={group.id} categoryName={group.name} athletes={group.athletes} locale={locale} share={share} />)}
  </>;
}
