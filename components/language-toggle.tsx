"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

export default function LanguageToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const [lang, setLang] = useState<Locale>("ru");
  const [open, setOpen] = useState(false);

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

  return <>
    <button
      type="button"
      aria-label={lang === "ru" ? "Открыть меню" : "Мәзірді ашу"}
      aria-expanded={open}
      onClick={() => setOpen(v => !v)}
      style={{position:"fixed",top:12,right:12,zIndex:101,width:44,height:44,border:"1px solid var(--line-strong)",borderRadius:12,background:"rgba(17,19,23,.96)",color:"#fff",fontSize:20,fontWeight:900,boxShadow:"0 6px 22px rgba(0,0,0,.3)"}}
    >{open ? "×" : "☰"}</button>

    {open && <>
      <button aria-label="Закрыть меню" type="button" onClick={() => setOpen(false)} style={{position:"fixed",inset:0,zIndex:99,border:0,background:"rgba(0,0,0,.48)"}} />
      <aside style={{position:"fixed",top:0,right:0,zIndex:100,width:"min(330px,88vw)",height:"100dvh",padding:"78px 20px 24px",background:"linear-gradient(180deg,#15171b,#0b0c0f)",borderLeft:"1px solid var(--line)",boxShadow:"-18px 0 50px rgba(0,0,0,.42)",display:"flex",flexDirection:"column",gap:16}}>
        <div>
          <div className="eyebrow">MENU</div>
          <h3 style={{margin:"7px 0 0",fontSize:22}}>{lang === "ru" ? "Настройки" : "Баптаулар"}</h3>
        </div>
        <div style={{padding:14,border:"1px solid var(--line)",borderRadius:12,background:"var(--surface)"}}>
          <div className="muted" style={{marginBottom:9}}>{lang === "ru" ? "Язык" : "Тіл"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button type="button" className={lang === "ru" ? "primary" : "secondary"} onClick={() => changeLang("ru")}>РУС</button>
            <button type="button" className={lang === "kk" ? "primary" : "secondary"} onClick={() => changeLang("kk")}>ҚАЗ</button>
          </div>
        </div>
        <Link className="primary" href="/login" onClick={() => setOpen(false)} style={{textAlign:"center"}}>{lang === "ru" ? "Войти" : "Кіру"}</Link>
      </aside>
    </>}
  </>;
}
