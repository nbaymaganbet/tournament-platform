"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { divisionNames, type Division } from "@/lib/tournament-divisions";

export default function DivisionSelect({ base, divisions, selected, legacyLabel }: {
  base: string;
  divisions: Division[];
  selected: string;
  legacyLabel?: string;
}) {
  const router = useRouter();
  const kk = useLocale() === "kk";
  const [pending, startTransition] = useTransition();

  if (!divisions.length && !legacyLabel) return null;
  return <label className="form-field">
    {kk ? "Бөлім" : "Раздел"}
    <select
      className="field"
      value={selected || "legacy"}
      disabled={pending || (divisions.length === 1 && !legacyLabel)}
      onChange={(event) => {
        const division = event.target.value;
        startTransition(() => router.push(`${base}?division=${division}`));
      }}
    >
      {divisions.map((division) => <option key={division} value={division}>{divisionNames[division]}</option>)}
      {legacyLabel && <option value="legacy">{legacyLabel}</option>}
    </select>
  </label>;
}
