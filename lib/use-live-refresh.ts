"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// RLS remains responsible for which row events a client may receive.
export function useLiveRefresh(tournamentId: string | undefined, tables: string, refresh: () => void | Promise<void>, paused = false, fallbackMs = 0) {
  const current = useRef({ refresh, paused });
  current.current = { refresh, paused };
  useEffect(() => {
    if (!tables) return;
    const s = createClient();
    let disposed = false, queued = false, running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function flush() {
      timer = undefined;
      if (disposed || !queued) return;
      if (document.visibilityState === "hidden" || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      if (running || current.current.paused || document.querySelector('[data-live-paused="true"]')) {
        timer = setTimeout(flush, 400);
        return;
      }
      queued = false;
      running = true;
      try { await current.current.refresh(); }
      catch { queued = true; }
      finally {
        running = false;
        if (queued && !disposed && !timer) timer = setTimeout(flush, 1000);
      }
    }
    function schedule() {
      queued = true;
      // A burst gets one refresh; continuous events cannot postpone it forever.
      if (!timer && !running) timer = setTimeout(flush, 300);
    }
    const channel = s.channel(`live-${tournamentId ?? "all"}-${Math.random().toString(36).slice(2)}`);
    for (const table of tables.split(",")) {
      const filter = tournamentId && table === "tournaments" ? `id=eq.${tournamentId}`
        : tournamentId && ["registrations", "categories", "mats", "matches", "results", "tournament_members"].includes(table) ? `tournament_id=eq.${tournamentId}` : undefined;
      channel.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, schedule);
    }
    const fallback = fallbackMs ? setInterval(visibleFallback, fallbackMs) : undefined;
    function visibleFallback() { if (document.visibilityState !== "hidden") schedule(); }
    channel.subscribe(status => { if (status === "SUBSCRIBED") schedule(); });
    const visible = () => { if (document.visibilityState !== "hidden") schedule(); };
    window.addEventListener("online", schedule);
    window.addEventListener("focus", visible);
    window.addEventListener("tp-action-finished", schedule);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (fallback) clearInterval(fallback);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", visible);
      window.removeEventListener("tp-action-finished", schedule);
      document.removeEventListener("visibilitychange", visible);
      void s.removeChannel(channel);
    };
  }, [tournamentId, tables, fallbackMs]);
}

export function useLiveReload(reload: () => void | Promise<void>) {
  const current = useRef(reload);
  current.current = reload;
  useEffect(() => {
    const update = () => { void Promise.resolve(current.current()).catch(() => {}); };
    window.addEventListener("tp-live-refresh", update);
    return () => window.removeEventListener("tp-live-refresh", update);
  }, []);
}
