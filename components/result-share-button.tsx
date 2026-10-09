"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { ResultAthlete } from "@/components/result-category";

export default function ResultShareButton({ tournamentName, categoryName, athletes, locale, url }: {
  tournamentName: string; categoryName: string; athletes: ResultAthlete[]; locale: Locale; url: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const kk = locale === "kk";
  const label = kk ? "Бөлісу" : "Поделиться";
  const title = `${tournamentName} · ${categoryName} · ${kk ? "Нәтижелер" : "Результаты"}`;

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      timeout = setTimeout(() => { controller.abort(); setPreparing(false); }, 15_000);
      // Prepare before the click so mobile sharing keeps its user activation.
      fetch(`${url}/opengraph-image?lang=${locale}&v=2`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) throw new Error("Image unavailable");
          const blob = await response.blob();
          if (!controller.signal.aborted) setFile(new File([blob], `results-${url.split("/").pop()}.png`, { type: "image/png" }));
        })
        .catch(() => { /* Sharing the complete text remains available if the image fails. */ })
        .finally(() => { clearTimeout(timeout); if (!controller.signal.aborted) setPreparing(false); });
    }, { rootMargin: "200px" });
    if (button.current) observer.observe(button.current);
    return () => { observer.disconnect(); clearTimeout(timeout); controller.abort(); };
  }, [url, locale]);

  async function share() {
    setBusy(true);
    setMessage("");
    const shareUrl = new URL(url, window.location.origin).toString();
    const text = `${title}\n${athletes.map(a => `${a.place === 1 ? "🥇" : a.place === 2 ? "🥈" : a.place === 3 ? "🥉" : `${a.place}.`} ${a.name}\n${a.age ?? "—"} ${kk ? "жас" : "лет"} · ${a.club || (kk ? "Клуб көрсетілмеген" : "Клуб не указан")} · ${a.coach || (kk ? "Жаттықтырушы көрсетілмеген" : "Тренер не указан")}`).join("\n\n")}\n${shareUrl}`;
    try {
      if (file && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title, files: [file], text: shareUrl });
      } else if (file) {
        const imageUrl = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(imageUrl), 60_000);
        try {
          await navigator.clipboard.writeText(shareUrl);
          setMessage(kk ? "Сурет сақталды. Сілтеме көшірілді." : "Картинка скачана. Ссылка скопирована.");
        } catch {
          setMessage(kk ? "Сурет сақталды." : "Картинка скачана.");
        }
      } else if (navigator.share) {
        await navigator.share({ title, text });
      } else {
        await navigator.clipboard.writeText(text);
        setMessage(kk ? "Нәтижелер мен сілтеме көшірілді." : "Результаты и ссылка скопированы.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(kk ? "Бөлісу мүмкін болмады. Қайталап көріңіз." : "Не удалось поделиться. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="result-share">
    <button ref={button} className="result-share-button" type="button" aria-label={label} title={label} aria-busy={preparing || busy} disabled={preparing || busy} onClick={() => void share()}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
      </svg>
    </button>
    {message && <p className="muted result-share-message" role="status">{message}</p>}
  </div>;
}
