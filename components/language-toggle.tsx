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
      style={{position:"fixed",top:12,right:12,zIndex:101,width:44,height:44,border:"1px solid rgba(225,6,0,.55)",borderRadius:12,background:"linear-gradient(145deg,#e10600,#a80400)",color:"#fff",fontSize:20,fontWeight:900,boxShadow:"0 6px 22px rgba(225,6,0,.28)"}}
    >{open ? "×" : "☰"}</button>

    {open && <>
      <button aria-label="Закрыть меню" type="button" onClick={() => setOpen(false)} style={{position:"fixed",inset:0,zIndex:99,border:0,background:"rgba(0,0,0,.52)"}} />
      <aside style={{position:"fixed",top:0,right:0,zIndex:100,width:"min(330px,88vw)",height:"100dvh",padding:"78px 20px 24px",background:"linear-gradient(180deg,#e10600 0%,#a80400 42%,#700300 100%)",borderLeft:"1px solid #ff4a44",boxShadow:"-18px 0 50px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",gap:16}}>
        <div>
          <div style={{color:"rgba(255,255,255,.7)",fontSize:11,fontWeight:900,letterSpacing:".12em"}}>MENU</div>
          <h3 style={{margin:"7px 0 0",fontSize:22,color:"#fff"}}>{lang === "ru" ? "Настройки" : "Баптаулар"}</h3>
        </div>
        <div style={{padding:14,border:"1px solid rgba(255,255,255,.22)",borderRadius:12,background:"rgba(0,0,0,.16)"}}>
          <div style={{color:"rgba(255,255,255,.72)",marginBottom:9}}>{lang === "ru" ? "Язык" : "Тіл"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <button type="button" style={{border:0,borderRadius:9,padding:"11px 15px",fontWeight:800,background:lang === "ru" ? "#fff" : "rgba(0,0,0,.18)",color:lang === "ru" ? "#a80400" : "#fff"}} onClick={() => changeLang("ru")}>РУС</button>
            <button type="button" style={{border:0,borderRadius:9,padding:"11px 15px",fontWeight:800,background:lang === "kk" ? "#fff" : "rgba(0,0,0,.18)",color:lang === "kk" ? "#a80400" : "#fff"}} onClick={() => changeLang("kk")}>ҚАЗ</button>
          </div>
        </div>
        <Link href="/login" onClick={() => setOpen(false)} style={{textAlign:"center",border:"1px solid rgba(255,255,255,.28)",borderRadius:10,padding:"12px 15px",fontWeight:850,color:"#fff",background:"rgba(0,0,0,.18)"}}>{lang === "ru" ? "Войти" : "Кіру"}</Link>
      </aside>
    </>}
  </>;
}
