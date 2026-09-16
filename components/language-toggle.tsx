"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

export default function LanguageToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const [lang, setLang] = useState<Locale>("ru");

  useEffect(() => {
    const saved = localStorage.getItem("tp-lang");
    if (saved === "ru" || saved === "kk") setLang(saved);
  }, [pathname]);

  function changeLang(next: Locale) {
    setLang(next);
    localStorage.setItem("tp-lang", next);
    document.cookie = `tp-lang=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 100, display: "flex", gap: 2, padding: 3, border: "1px solid var(--line)", background: "rgba(17,19,23,.96)", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,.28)" }} aria-label="Language">
      <button style={{ border: 0, background: lang === "ru" ? "var(--accent)" : "transparent", color: lang === "ru" ? "#fff" : "var(--muted)", borderRadius: 7, padding: "6px 9px", fontSize: 11, fontWeight: 900 }} onClick={() => changeLang("ru")} type="button">РУС</button>
      <button style={{ border: 0, background: lang === "kk" ? "var(--accent)" : "transparent", color: lang === "kk" ? "#fff" : "var(--muted)", borderRadius: 7, padding: "6px 9px", fontSize: 11, fontWeight: 900 }} onClick={() => changeLang("kk")} type="button">ҚАЗ</button>
    </div>
  );
}
