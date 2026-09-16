"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function TournamentSidebar({ tournamentId, tournamentName }: { tournamentId: string; tournamentName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/organizer/tournaments/${tournamentId}`;
  const links = [
    ["Обзор", base],
    ["Участники", `${base}/participants`],
    ["Категории", `${base}/categories`],
    ["Взвешивание", `${base}/weigh-in`],
    ["Сетка и расписание", `${base}/brackets`],
    ["Настройки", `${base}/settings`],
    ["Положение", `/tournaments/${tournamentId}/regulations`],
    ["Команда", `${base}/team`],
  ];

  function close() { setOpen(false); }

  return (
    <>
      <button className="tp-sidebar-trigger" type="button" onClick={() => setOpen(true)} aria-label="Открыть меню">☰</button>
      {open && <button className="tp-sidebar-backdrop" type="button" aria-label="Закрыть меню" onClick={close} />}
      <aside className={`tp-sidebar ${open ? "open" : ""}`}>
        <div className="tp-sidebar-head">
          <div>
            <div className="tp-sidebar-title">ТУРНИР</div>
            <div className="tp-sidebar-event">{tournamentName}</div>
          </div>
          <button className="tp-sidebar-close" type="button" onClick={close} aria-label="Закрыть меню">×</button>
        </div>
        <nav className="tp-sidebar-nav" aria-label="Разделы турнира">
          {links.map(([label, href]) => {
            const cleanHref = href.split("#")[0];
            const active = cleanHref === base ? pathname === base : pathname.startsWith(cleanHref);
            return <Link key={href} href={href} className={active ? "active" : ""} onClick={close}>{label}</Link>;
          })}
        </nav>
        <div className="tp-sidebar-bottom">
          <Link href="/organizer" onClick={close}>← Все турниры</Link>
          <Link href="/" onClick={close}>Главная платформа</Link>
        </div>
      </aside>
      <style jsx>{`
        .tp-sidebar{position:fixed;left:0;top:0;bottom:0;width:270px;padding:22px 14px;background:var(--bg-soft);border-right:1px solid var(--line);z-index:60;display:flex;flex-direction:column;overflow:auto;box-shadow:18px 0 50px rgba(0,0,0,.28)}
        .tp-sidebar-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
        .tp-sidebar-title{padding:4px 12px;color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.12em}
        .tp-sidebar-event{padding:8px 12px 18px;font-size:17px;font-weight:900;line-height:1.2;word-break:break-word}
        .tp-sidebar-close{display:none;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:9px;width:38px;height:38px;font-size:24px;line-height:1}
        .tp-sidebar-nav{display:grid;gap:4px}
        .tp-sidebar-nav a{display:flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid transparent;border-radius:9px;color:var(--muted);font-size:14px;font-weight:800;transition:.16s ease}
        .tp-sidebar-nav a:hover{color:var(--text);background:var(--surface-2);border-color:var(--line)}
        .tp-sidebar-nav a.active{color:#fff;background:var(--accent);border-color:var(--accent);box-shadow:0 5px 16px rgba(225,6,0,.2)}
        .tp-sidebar-bottom{margin-top:auto;padding-top:18px;border-top:1px solid var(--line);display:grid;gap:4px}
        .tp-sidebar-bottom a{padding:9px 12px;color:var(--muted);font-size:13px;font-weight:700}
        .tp-sidebar-bottom a:hover{color:var(--text)}
        .tp-sidebar-trigger{display:none}
        .tp-sidebar-backdrop{display:none}
        @media(max-width:900px){
          .tp-sidebar{transform:translateX(-105%);transition:transform .2s ease;width:min(310px,88vw);background:var(--bg-soft)}
          .tp-sidebar.open{transform:translateX(0)}
          .tp-sidebar-close{display:block}
          .tp-sidebar-trigger{display:flex;position:fixed;top:12px;left:12px;z-index:50;width:42px;height:42px;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font-size:20px;box-shadow:0 6px 20px rgba(0,0,0,.25)}
          .tp-sidebar-backdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.62);border:0;z-index:55}
        }
      `}</style>
    </>
  );
}
