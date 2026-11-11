import { victoryMethods } from "@/lib/scoreboard";

export const divisions = ["gi", "no_gi"] as const;
export type Division = (typeof divisions)[number];
export const divisionNames: Record<Division, string> = { gi: "Gi", no_gi: "No-Gi" };
export const sports = ["Бокс", "ММА", "Грэпплинг"] as const;

export function availableDivisions(values: string[] | null | undefined): Division[] {
  return divisions.filter((division) => values?.includes(division));
}

export function categoryLabel(name: string, division: string | undefined) {
  return division === "gi" || division === "no_gi" ? `${divisionNames[division]} · ${name}` : name;
}

export function methodsForSport(sport: string): string[] {
  const excluded = sport === "Грэпплинг" ? ["ko", "tko"] : sport === "Бокс" ? ["submission"] : [];
  return victoryMethods.map(([method]) => method).filter((method) => !excluded.includes(method));
}
