"use client";

import { useLocale } from "@/components/locale-provider";

export default function LoadingIndicator({ overlay = false }: { overlay?: boolean }) {
  const kk = useLocale() === "kk";
  return <div className={overlay ? "tp-loading-overlay" : "tp-loading"} role="status" aria-live="polite" onClick={overlay ? event => { event.preventDefault(); event.stopPropagation(); } : undefined}>
    <span className="tp-spinner" aria-hidden="true" />
    <span>{kk ? "Жүктелуде…" : "Загрузка…"}</span>
  </div>;
}
