"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translations, type Locale } from "@/lib/i18n";

type Row = { id:string; participant_id:string; application_number:string|null; status:string; payment_status:string; first_name:string; last_name:string; age:number; weight:number; experience:string|null; phone:string|null; club:string|null; coach:string|null };

export default function ParticipantsClient({ tournamentId, initialRows }: { tournamentId:string; initialRows:Row[] }) {
  const [locale] = useState<Locale>(() => typeof window !== "undefined" && localStorage.getItem("tp-lang") === "kk" ? "kk" : "ru");
  const t = translations[locale];
  const [rows,setRows]=useState(initialRows); const [query,setQuery]=useState(""); const [statusFilter,setStatusFilter]=useState("all"); const [busy,setBusy]=useState<string|null>(null); const supabase=createClient();
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase(); return rows.filter(r=>{const text=[r.first_name,r.last_name,r.club,r.coach,r.application_number,r.phone].filter(Boolean).join(" ").toLowerCase(); return (!q||text.includes(q))&&(statusFilter==="all"||r.status===statusFilter);});},[rows,query,statusFilter]);

  async function confirmPayment(id:string){
    setBusy(id);
    const {data,error}=await supabase.from("registrations").update({payment_status:"paid",status:"confirmed"}).eq("id",id).eq("tournament_id",tournamentId).select("id,status,payment_status").single();
    if(!error&&data)setRows(c=>c.map(r=>r.id===id?{...r,...data}:r));
    if(error)window.alert(error.message);
    setBusy(null);
  }

  return <div className="participants-workspace">
    <div className="toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.participantSearch}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">{t.allStatuses}</option>{Object.entries(t.participantStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
    <div className="participants-list">
      {filtered.length===0?<div className="empty-state">{t.noApplications}</div>:filtered.map(r=>{
        const confirmed = r.payment_status === "paid" && r.status === "confirmed";
        return <article className="participant-card" key={r.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"center",gap:12}}>
          <div className="participant-main" style={{minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <strong>{r.last_name} {r.first_name}</strong>
              <span className="status" style={{margin:0,background:confirmed?"rgba(53,200,117,.1)":"rgba(225,6,0,.12)",borderColor:confirmed?"rgba(53,200,117,.3)":"rgba(225,6,0,.25)",color:confirmed?"#6fe39b":"#ff625d"}}>{confirmed?t.participantStatuses.confirmed:t.participantStatuses[r.status as keyof typeof t.participantStatuses]??r.status}</span>
            </div>
            <span className="muted">#{r.application_number??"—"} · {r.age} {t.years} · {r.weight} кг · {r.club||t.clubNotSet}</span>
            <span className="muted">{r.coach?`${t.coach}: ${r.coach}`:t.coachNotSet} · {r.phone||t.phoneNotSet}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"stretch",gap:7,minWidth:170}}>
            {confirmed ? <span style={{display:"block",padding:"9px 10px",borderRadius:9,border:"1px solid rgba(53,200,117,.28)",background:"rgba(53,200,117,.08)",color:"#6fe39b",fontSize:12,fontWeight:850,textAlign:"center"}}>{t.paid} · {t.participantStatuses.confirmed}</span> : <button className="primary" disabled={busy===r.id} onClick={()=>void confirmPayment(r.id)} style={{minHeight:44,whiteSpace:"nowrap"}}>{busy===r.id?"…":t.confirmPayment}</button>}
          </div>
        </article>;
      })}
    </div>
  </div>;
}
