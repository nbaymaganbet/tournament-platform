"use client";

import { useLocale } from "@/components/locale-provider";
import { victoryMethods } from "@/lib/scoreboard";
import { availableDivisions, divisionNames, divisions, methodsForSport, sports, type Division } from "@/lib/tournament-divisions";

export type SportSettings = { sport: string; divisions: Division[]; victoryMethods: string[] | null };

export default function TournamentSportFields({ value, onChange }: {
  value: SportSettings;
  onChange: (settings: SportSettings) => void;
}) {
  const ru = useLocale() === "ru";
  const methods = value.victoryMethods ?? victoryMethods.map(([method]) => method);

  return <>
    <label>{ru ? "Вид спорта" : "Спорт түрі"}
      <select className="field" value={value.sport} onChange={(event) => {
        const sport = event.target.value;
        onChange({ sport, divisions: value.divisions, victoryMethods: methodsForSport(sport) });
      }}>
        <option value="">{ru ? "Выберите вид спорта" : "Спорт түрін таңдаңыз"}</option>
        {value.sport && !sports.some((sport) => sport === value.sport) && <option>{value.sport}</option>}
        {sports.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
      </select>
    </label>
    {(value.sport === "Грэпплинг" || value.divisions.length > 0) && <fieldset>
      <legend>{ru ? "Разделы турнира" : "Жарыс бөлімдері"}</legend>
      {divisions.map((division) => <label className="checkbox-row" key={division}>
        <input type="checkbox" checked={value.divisions.includes(division)} onChange={(event) => onChange({
          ...value,
          divisions: availableDivisions(event.target.checked ? [...value.divisions, division] : value.divisions.filter((item) => item !== division)),
        })} />
        {divisionNames[division]}
      </label>)}
    </fieldset>}
    <fieldset>
      <legend>{ru ? "Способы победы" : "Жеңіс тәсілдері"}</legend>
      {victoryMethods.map(([method, ruLabel, kkLabel]) => <label className="checkbox-row" key={method}>
        <input type="checkbox" checked={methods.includes(method)} onChange={(event) => onChange({
          ...value,
          victoryMethods: event.target.checked ? [...methods, method] : methods.filter((item) => item !== method),
        })} />
        {ru ? ruLabel : kkLabel}
      </label>)}
    </fieldset>
  </>;
}
