"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";

export default function ShareEventButton({ title, locale = "ru", url }: { title: string; locale?: Locale; url?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const label = locale === "ru" ? "Поделиться" : "Бөлісу";

  async function share() {
    setBusy(true);
    setMessage("");
    try {
      const shareUrl = url ? new URL(url, window.location.origin).toString() : window.location.href;
      if (navigator.share) {
        await navigator.share({ title, url: shareUrl });
        setMessage(locale === "ru" ? "Ссылка готова к отправке." : "Сілтеме жіберуге дайын.");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setMessage(locale === "ru" ? "Ссылка скопирована." : "Сілтеме көшірілді.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMessage(locale === "ru" ? "Не удалось поделиться ссылкой." : "Сілтемемен бөлісу мүмкін болмады.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="public-share"><button className="secondary full" type="button" onClick={share} disabled={busy}>{busy ? "…" : label}</button>{message && <p className="muted public-share-message">{message}</p>}</div>;
}
