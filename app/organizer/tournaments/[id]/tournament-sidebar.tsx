"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TournamentSidebar({ tournamentId, tournamentName }: { tournamentId: string; tournamentName: string }) {
  const pathname = usePathname();
  const base = `/organizer/tournaments/${tournamentId}`;
  const links = [
    ["Обзор", base],
    ["Участники", `${base}/participants`],
    ["Категории", `${base}/categories`],
    ["Взвешивание", `${base}/weigh-in`],
    ["Сетки", `${base}/brackets`],
    ["Расписание", `${base}/schedule`],
    ["Матчи", `${base}/running`],
    ["Результаты", `${base}/results`],
    ["Настройки", `${base}/settings`],
    ["Команда", `${base}/team`],
  ];

  return (
    <>
      <aside className="tp-sidebar">
        <div className="tp-sidebar-title">ТУРНИР</div>
        <div className="tp-sidebar-event">{tournamentName}</div>
        <nav className="tp-sidebar-nav" aria-label="Разделы турнира">
          {links.map(([label, href]) => {
            const active = href === base ? pathname === base : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? "active" : ""}>{label}</Link>;
          })}
        </nav>
        <div className="tp-sidebar-bottom">
          <Link href="/organizer">← Все турниры</Link>
          <Link href="/">Главная платформа</Link>
        </div>
      </aside>
      <style jsx>{`
        .tp-sidebar{position:fixed;left:0;top:0;bottom:0;width:252px;padding:24px 14px;background:rgba(13,15,18,.96);border-right:1px solid #292d34;z-index:30;display:flex;flex-direction:column;overflow:auto;backdrop-filter:blur(16px)}
        .tp-sidebar-title{padding:4px 12px;color:#e84b46;font-size:11px;font-weight:900;letter-spacing:.12em}
        .tp-sidebar-event{padding:8px 12px 18px;font-size:17px;font-weight:900;line-height:1.2;word-break:break-word}
        .tp-sidebar-nav{display:grid;gap:4px}
        .tp-sidebar-nav a{display:flex;align-items:center;min-height:42px;padding:0 12px;border:1px solid transparent;border-radius:9px;color:#8e949f;font-size:14px;font-weight:800;transition:.16s ease}
        .tp-sidebar-nav a:hover{color:#f5f5f5;background:#17191e;border-color:#292d34}
        .tp-sidebar-nav a.active{color:#fff;background:#e10600;border-color:#e10600;box-shadow:0 5px 16px rgba(225,6,0,.2)}
        .tp-sidebar-bottom{margin-top:auto;padding-top:18px;border-top:1px solid #292d34;display:grid;gap:4px}
        .tp-sidebar-bottom a{padding:9px 12px;color:#8e949f;font-size:13px;font-weight:700}
        .tp-sidebar-bottom a:hover{color:#f5f5f5}
        @media(max-width:900px){.tp-sidebar{position:sticky;top:0;bottom:auto;width:100%;height:auto;padding:10px;display:block;border-right:0;border-bottom:1px solid #292d34}.tp-sidebar-title{display:none}.tp-sidebar-event{padding:4px 8px 8px}.tp-sidebar-nav{display:flex;overflow-x:auto;scrollbar-width:none}.tp-sidebar-nav::-webkit-scrollbar{display:none}.tp-sidebar-nav a{flex:0 0 auto;min-height:40px;padding:0 12px}.tp-sidebar-bottom{display:none}}
      `}</style>
    </>
  );
}
