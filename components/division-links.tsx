import Link from "@/components/pending-link";
import { divisionNames, type Division } from "@/lib/tournament-divisions";

export default function DivisionLinks({ base, divisions, selected, legacyLabel }: {
  base: string;
  divisions: Division[];
  selected: string;
  legacyLabel?: string;
}) {
  if (divisions.length < 2 && !legacyLabel) return null;
  return <nav className="button-row">
    {divisions.map((division) => <Link key={division} className="secondary" aria-current={selected === division ? "page" : undefined} href={`${base}?division=${division}`}>{divisionNames[division]}</Link>)}
    {legacyLabel && <Link className="secondary" aria-current={selected === "" ? "page" : undefined} href={`${base}?division=legacy`}>{legacyLabel}</Link>}
  </nav>;
}
