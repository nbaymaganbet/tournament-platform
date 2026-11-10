"use client";

import { useRef, useState, type PointerEvent } from "react";
import Link from "@/components/pending-link";
import type { Locale } from "@/lib/i18n";
import styles from "./poster-gallery.module.css";

type Poster = { display: string; original?: string };

type Props = {
  posters: Poster[];
  title: string;
  locale: Locale;
  eventHref?: string;
  fallback?: string;
};

export default function PosterGallery({ posters, title, locale, eventHref, fallback }: Props) {
  const [selected, setSelected] = useState(0);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const index = Math.min(selected, Math.max(0, posters.length - 1));
  const poster = posters[index];
  const multiple = posters.length > 1;
  const ru = locale === "ru";
  const originalLabel = ru ? "Открыть оригинал" : "Түпнұсқаны ашу";

  function move(direction: number) {
    setSelected((current) => {
      const currentIndex = Math.min(current, posters.length - 1);
      return (currentIndex + direction + posters.length) % posters.length;
    });
  }

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    swiped.current = false;
    if (multiple && event.isPrimary && event.pointerType !== "mouse") {
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }

  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (start?.id !== event.pointerId) return;
    gesture.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      move(dx < 0 ? 1 : -1);
    }
  }

  const image = poster ? (
    // The display URL points to the prepared preview.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.image} src={poster.display} alt={`${title} — афиша ${index + 1}`} loading="lazy" draggable={false} />
  ) : <div className={`poster ${styles.fallback}`}>{fallback}</div>;

  return (
    <div className={styles.gallery}>
      <div
        className={`${styles.frame} ${multiple ? styles.swipe : ""}`}
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => { gesture.current = null; }}
        onClickCapture={(event) => {
          if (event.detail > 0 && swiped.current) {
            swiped.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {eventHref ? (
          <Link className={styles.imageLink} href={eventHref}>{image}</Link>
        ) : poster?.original ? (
          <a className={styles.imageLink} href={poster.original} target="_blank" rel="noreferrer" tabIndex={-1}>{image}</a>
        ) : image}
      </div>
      {multiple && (
        <div className={styles.controls}>
          <button type="button" onClick={() => move(-1)} aria-label={ru ? "Предыдущая афиша" : "Алдыңғы афиша"}>‹</button>
          <span className="muted" aria-live="polite" aria-label={ru ? "Номер афиши" : "Афиша нөмірі"}>{index + 1} / {posters.length}</span>
          <button type="button" onClick={() => move(1)} aria-label={ru ? "Следующая афиша" : "Келесі афиша"}>›</button>
        </div>
      )}
      {poster?.original && (
        <a className={`muted ${styles.original}`} href={poster.original} target="_blank" rel="noreferrer">
          {originalLabel} ↗
        </a>
      )}
    </div>
  );
}
