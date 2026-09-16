"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";

export default function ShareEventButton({ title, locale = "ru" }: { title: string; locale?: Locale }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = locale === "ru" ? "Поделиться" : "Бөлісу";

  async function share() {
    setBusy(true);
    setError("");
    try {
      const url = window.location.href;
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setError(locale === "ru" ? "Ссылка скопирована. Теперь её можно отправить в нужный чат." : "Сілтеме көшірілді. Енді оны қажетті чатқа жіберуге болады.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(locale === "ru" ? "Не удалось поделиться ссылкой." : "Сілтемемен бөлісу мүмкін болмады.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="public-share"><button className="primary full" type="button" onClick={share} disabled={busy}>{busy ? "…" : label}</button>{error && <p className="muted public-share-message">{error}</p>}</div>;
}
