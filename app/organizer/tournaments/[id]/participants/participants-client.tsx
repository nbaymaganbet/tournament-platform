"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translations, type Locale } from "@/lib/i18n";

type Row = { id:string; participant_id:string; application_number:string|null; status:string; payment_status:string; first_name:string; last_name:string; age:number; weight:number; experience:string|null; phone:string|null; club:string|null; coach:string|null };

export default function ParticipantsClient({ tournamentId, initialRows }: { tournamentId:string; initialRows:Row[] }) {
  const [locale] = useState<Locale>(() => typeof window !== "undefined" && localStorage.getItem("tp-lang") === "kk" ? "kk" : "ru");
  const t = translations[locale];
  const [rows,setRows]=useState(initialRows); const [query,setQuery]=useState(""); const [statusFilter,setStatusFilter]=useState("all"); const [busy,setBusy]=useState<string|null>(null); const supabase=createClient();
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase(); return rows.filter(r=>{const text=[r.first_name,r.last_name,r.club,r.coach,r.application_number,r.phone].filter(Boolean).join(" ").toLowerCase(); const confirmed=r.payment_status==="paid"&&r.status==="confirmed"; const statusOk=statusFilter==="all"||(statusFilter==="confirmed"?confirmed:!confirmed); return (!q||text.includes(q))&&statusOk;});},[rows,query,statusFilter]);

  async function confirmPayment(id:string){
    setBusy(id);
    const {data,error}=await supabase.from("registrations").update({payment_status:"paid",status:"confirmed"}).eq("id",id).eq("tournament_id",tournamentId).select("id,status,payment_status").single();
    if(!error&&data)setRows(c=>c.map(r=>r.id===id?{...r,...data}:r));
    if(error)window.alert(error.message);
    setBusy(null);
  }

  return <div className="participants-workspace">
    <div className="toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.participantSearch}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">{t.allStatuses}</option><option value="pending_confirmation">{t.pending}</option><option value="confirmed">{t.participantStatuses.confirmed}</option></select></div>
    <div className="participants-list">
      {filtered.length===0?<div className="empty-state">{t.noApplications}</div>:filtered.map(r=>{
        const confirmed = r.payment_status === "paid" && r.status === "confirmed";
        return <article className="participant-card" key={r.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"center",gap:12}}>
          <div className="participant-main" style={{minWidth:0}}>
            <strong>{r.last_name} {r.first_name}</strong>
            <span className="muted">#{r.application_number??"—"} · {r.age} {t.years} · {r.weight} кг · {r.club||t.clubNotSet}</span>
            <span className="muted">{r.coach?`${t.coach}: ${r.coach}`:t.coachNotSet} · {r.phone||t.phoneNotSet}</span>
          </div>
          <button className={confirmed?"secondary":"primary"} disabled={busy===r.id||confirmed} onClick={()=>void confirmPayment(r.id)} style={{minHeight:44,minWidth:170,whiteSpace:"nowrap"}}>{busy===r.id?"…":confirmed?t.participantStatuses.confirmed:t.confirmPayment}</button>
        </article>;
      })}
    </div>
  </div>;
}
