"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

export default function LanguageToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const [lang, setLang] = useState<Locale>("ru");
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [organizerName, setOrganizerName] = useState("");

  const tournamentMatch = pathname.match(/^\/organizer\/tournaments\/([^/]+)/);
  const tournamentId = tournamentMatch?.[1] && tournamentMatch[1] !== "new" ? tournamentMatch[1] : null;
  const tournamentBase = tournamentId ? `/organizer/tournaments/${tournamentId}` : null;
  const tournamentLinks = tournamentBase ? [
    ["Обзор", tournamentBase],
    ["Участники", `${tournamentBase}/participants`],
    ["Категории", `${tournamentBase}/categories`],
    ["Взвешивание", `${tournamentBase}/weigh-in`],
    ["Сетка и расписание", `${tournamentBase}/brackets`],
    ["Расписание", `${tournamentBase}/schedule`],
    ["Проведение", `${tournamentBase}/running`],
    ["Результаты", `${tournamentBase}/results`],
    ["Настройки", `${tournamentBase}/settings`],
    ["Команда", `${tournamentBase}/team`],
  ] : [];

  useEffect(() => {
    const saved = localStorage.getItem("tp-lang");
    if (saved === "ru" || saved === "kk") setLang(saved);
    let mounted = true;
    const supabase = createClient();
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setSignedIn(!!data.user);
      setEmail(data.user?.email ?? "");
      if (data.user) {
        const { data: organizer } = await supabase.from("organizers").select("display_name").eq("user_id", data.user.id).maybeSingle();
        if (mounted) setOrganizerName(organizer?.display_name ?? "");
      } else setOrganizerName("");
    };
    loadUser();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSignedIn(!!session?.user); setEmail(session?.user?.email ?? "");
      if (session?.user) {
        const { data: organizer } = await supabase.from("organizers").select("display_name").eq("user_id", session.user.id).maybeSingle();
        if (mounted) setOrganizerName(organizer?.display_name ?? "");
      } else setOrganizerName("");
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [pathname]);

  function changeLang(next: Locale) {
    setLang(next);
    localStorage.setItem("tp-lang", next);
    document.cookie = `tp-lang=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  function openHelp() {
    setOpen(false);
    window.dispatchEvent(new Event("tp-open-onboarding"));
  }

  async function handleAuthAction() {
    const supabase = createClient();
    if (signedIn) {
      await supabase.auth.signOut();
      setSignedIn(false); setEmail(""); setOrganizerName(""); setOpen(false);
      router.push("/"); router.refresh();
      return;
    }
    setOpen(false); router.push("/login");
  }

  return <>
    <button
      type="button"
      aria-label={lang === "ru" ? "Открыть меню" : "Мәзірді ашу"}
      aria-expanded={open}
      onClick={() => setOpen(v => !v)}
      style={{position:"fixed",top:12,right:12,zIndex:101,width:44,height:44,border:"1px solid #292d34",borderRadius:12,background:"#111317",color:"#f5f5f5",fontSize:20,fontWeight:900,boxShadow:"0 6px 22px rgba(0,0,0,.3)"}}
    >{open ? "×" : "☰"}</button>

    {open && <>
      <button aria-label={lang === "ru" ? "Закрыть меню" : "Мәзірді жабу"} type="button" onClick={() => setOpen(false)} style={{position:"fixed",inset:0,zIndex:99,border:0,background:"rgba(0,0,0,.58)"}} />
      <aside style={{position:"fixed",top:0,right:0,zIndex:100,width:"min(340px,90vw)",height:"100dvh",padding:"78px 18px 22px",background:"#0d0f12",borderLeft:"1px solid #292d34",boxShadow:"-18px 0 50px rgba(0,0,0,.55)",display:"flex",flexDirection:"column",overflowY:"auto"}}>
        {tournamentBase ? <>
          <div style={{padding:"0 8px 14px",borderBottom:"1px solid #292d34"}}>
            <div style={{color:"#8e949f",fontSize:11,fontWeight:900,letterSpacing:".12em"}}>ТУРНИР</div>
            <div style={{marginTop:6,color:"#f5f5f5",fontSize:18,fontWeight:900}}>Управление соревнованием</div>
          </div>
          <nav aria-label="Разделы турнира" style={{display:"grid",gap:4,paddingTop:14}}>
            {tournamentLinks.map(([label, href]) => {
              const active = href === tournamentBase ? pathname === tournamentBase : pathname.startsWith(href);
              return <Link key={href} href={href} onClick={() => setOpen(false)} style={{display:"flex",alignItems:"center",minHeight:44,padding:"0 12px",border:`1px solid ${active ? "#292d34" : "transparent"}`,borderRadius:9,color:active?"#fff":"#8e949f",background:active?"#17191e":"transparent",fontSize:14,fontWeight:800}}>{label}</Link>;
            })}
          </nav>
          <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid #292d34",display:"grid",gap:4}}>
            <Link href="/organizer" onClick={() => setOpen(false)} style={{padding:"10px 12px",color:"#8e949f",fontSize:13,fontWeight:750}}>← Все турниры</Link>
          </div>
        </> : <>
          <div style={{padding:"0 8px 14px",borderBottom:"1px solid #292d34"}}>
            <div style={{color:"#8e949f",fontSize:11,fontWeight:900,letterSpacing:".12em"}}>{lang === "ru" ? "МЕНЮ" : "МӘЗІР"}</div>
            <h3 style={{margin:"7px 0 0",fontSize:22,color:"#f5f5f5"}}>{lang === "ru" ? "Настройки" : "Баптаулар"}</h3>
          </div>
          <div style={{padding:"14px 0",display:"grid",gap:12}}>
            <div style={{padding:14,border:"1px solid #292d34",borderRadius:12,background:"#111317"}}>
              <div style={{color:"#8e949f",marginBottom:9}}>{lang === "ru" ? "Язык" : "Тіл"}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button type="button" style={{border:"1px solid #292d34",borderRadius:9,padding:"11px 15px",fontWeight:800,background:lang === "ru" ? "#e10600" : "#17191e",color:"#fff"}} onClick={() => changeLang("ru")}>РУС</button>
                <button type="button" style={{border:"1px solid #292d34",borderRadius:9,padding:"11px 15px",fontWeight:800,background:lang === "kk" ? "#e10600" : "#17191e",color:"#fff"}} onClick={() => changeLang("kk")}>ҚАЗ</button>
              </div>
            </div>
            {signedIn ? <>
              <Link href="/organizer" onClick={() => setOpen(false)} style={{display:"block",border:"1px solid #292d34",borderRadius:10,padding:"12px 15px",color:"#f5f5f5",background:"#111317",textDecoration:"none"}}><div style={{fontWeight:850}}>{organizerName || (lang === "ru" ? "Организатор" : "Ұйымдастырушы")}</div><div style={{marginTop:4,color:"#8e949f",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{email}</div></Link>
              <button type="button" onClick={handleAuthAction} style={{textAlign:"center",border:"1px solid #292d34",borderRadius:10,padding:"12px 15px",fontWeight:850,color:"#f5f5f5",background:"#111317"}}>{lang === "ru" ? "Выйти" : "Шығу"}</button>
            </> : <button type="button" onClick={handleAuthAction} style={{textAlign:"center",border:"1px solid #292d34",borderRadius:10,padding:"12px 15px",fontWeight:850,color:"#f5f5f5",background:"#111317"}}>{lang === "ru" ? "Войти" : "Кіру"}</button>}
            <button type="button" onClick={openHelp} style={{textAlign:"left",border:"1px solid #292d34",borderRadius:10,padding:"12px 15px",fontWeight:850,color:"#f5f5f5",background:"#111317",display:"flex",alignItems:"center",gap:10}}><span style={{width:28,height:28,borderRadius:"50%",border:"1px solid #383d46",display:"grid",placeItems:"center"}}>?</span>{lang === "ru" ? "Справка" : "Анықтама"}</button>
          </div>
        </>}
      </aside>
    </>}
  </>;
}
