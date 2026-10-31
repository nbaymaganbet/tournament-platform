"use client";

import { useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";

export function useActionFeedback(reset?: () => void) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const kk = useLocale() === "kk";
  async function run(task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      await task();
    } catch {
      setError(kk ? "Әрекетті орындау мүмкін болмады. Байланысты тексеріп, қайталап көріңіз." : "Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      reset?.();
      locked.current = false;
      setPending(false);
      window.dispatchEvent(new Event("tp-action-finished"));
    }
  }
  return { pending, error, run };
}

export function ActionScope({ pending, error, paused = false, children }: { pending: boolean; error: string; paused?: boolean; children: ReactNode }) {
  const kk = useLocale() === "kk";
  return <fieldset className="tp-action-scope" disabled={pending} aria-busy={pending} data-live-paused={pending || paused}>
    {pending && <div className="tp-action-status" role="status"><span className="tp-spinner" aria-hidden="true" />{kk ? "Орындалуда…" : "Выполняется…"}</div>}
    {error && <p className="error" role="alert">{error}</p>}
    {children}
  </fieldset>;
}
