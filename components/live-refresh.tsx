"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLiveRefresh } from "@/lib/use-live-refresh";

const workingTables = "tournaments,registrations,participants,categories,category_participants,brackets,mats,matches,match_schedule,results,tournament_members";

export default function LiveRefresh({ tournamentId, tables = workingTables }: { tournamentId?: string; tables?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  useLiveRefresh(tournamentId, pathname.endsWith("/settings") ? "" : tables, () => {
    startTransition(() => router.refresh());
    window.dispatchEvent(new Event("tp-live-refresh"));
  }, pending, pathname.endsWith("/team")||pathname.startsWith("/tournaments/") ? 15000 : 0);
  return null;
}
