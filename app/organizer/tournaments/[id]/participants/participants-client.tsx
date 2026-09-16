"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translations, type Locale } from "@/lib/i18n";

type Row = { id:string; participant_id:string; application_number:string|null; status:string; payment_status:string; first_name:string; last_name:string; age:number; weight:number; actual_weight:number|null; experience:string|null; phone:string|null; club:string|null; coach:string|null };

export default function ParticipantsClient({ tournamentId, initialRows }: { tournamentId:string; initialRows:Row[] }) {
  const [locale] = useState<Locale>(() => typeof window !== "undefined" && localStorage.getItem("tp-lang") === "kk" ? "kk" : "ru");
  const t = translations[locale];
  const labels=locale==="kk"?{weighIn:"Өлшеудегі салмақ",save:"Сақтау",saved:"Салмақ сақталды",official:"ресми"}:{weighIn:"Вес на взвешивании",save:"Сохранить",saved:"Вес сохранён",official:"официальный"};
  const [rows,setRows]=useState(initialRows); const [query,setQuery]=useState(""); const [statusFilter,setStatusFilter]=useState("all"); const [busy,setBusy]=useState<string|null>(null); const supabase=createClient();
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase(); return rows.filter(r=>{const text=[r.first_name,r.last_name,r.club,r.coach,r.application_number,r.phone].filter(Boolean).join(" ").toLowerCase(); const confirmed=r.payment_status==="paid"&&r.status==="confirmed"; const statusOk=statusFilter==="all"||(statusFilter==="confirmed"?confirmed:!confirmed); return (!q||text.includes(q))&&statusOk;});},[rows,query,statusFilter]);

  async function confirmPayment(id:string){setBusy(id);const {data,error}=await supabase.from("registrations").update({payment_status:"paid",status:"confirmed"}).eq("id",id).eq("tournament_id",tournamentId).select("id,status,payment_status").single();if(!error&&data)setRows(c=>c.map(r=>r.id===id?{...r,...data}:r));if(error)window.alert(error.message);setBusy(null);}
  async function saveActualWeight(row:Row,value:string){setBusy(`weight:${row.id}`);const parsed=value.trim()===""?null:Number(value);if(parsed!==null&&!Number.isFinite(parsed)){window.alert("Введите корректный вес.");setBusy(null);return}const{error}=await supabase.from("participants").update({actual_weight:parsed}).eq("id",row.participant_id);if(error)window.alert(error.message);else{setRows(c=>c.map(r=>r.id===row.id?{...r,actual_weight:parsed}:r));}setBusy(null);}

  return <div className="participants-workspace">
    <div className="toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.participantSearch}/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">{t.allStatuses}</option><option value="pending_confirmation">{t.pending}</option><option value="confirmed">{t.participantStatuses.confirmed}</option></select></div>
    <div className="participants-list">
      {filtered.length===0?<div className="empty-state">{t.noApplications}</div>:filtered.map(r=>{
        const confirmed = r.payment_status === "paid" && r.status === "confirmed";
        return <article className="participant-card" key={r.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"center",gap:12}}>
          <div className="participant-main" style={{minWidth:0}}>
            <strong>{r.last_name} {r.first_name}</strong>
            <span className="muted">#{r.application_number??"—"} · {r.age} {t.years} · заявлено {r.weight} кг · {r.club||t.clubNotSet}</span>
            <span className="muted">{r.coach?`${t.coach}: ${r.coach}`:t.coachNotSet} · {r.phone||t.phoneNotSet}</span>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:6}}><label style={{display:"flex",gap:6,alignItems:"center"}}><span className="muted">{labels.weighIn}</span><input className="field" style={{width:110}} type="number" min="0" step="0.1" defaultValue={r.actual_weight??""} id={`weight-${r.id}`} placeholder={`${r.weight}`} /></label><button className="secondary" disabled={busy===`weight:${r.id}`} onClick={()=>{const el=document.getElementById(`weight-${r.id}`) as HTMLInputElement|null;void saveActualWeight(r,el?.value??"")}}>{busy===`weight:${r.id}`?"…":labels.save}</button>{r.actual_weight!=null&&<span className="muted">{r.actual_weight} кг · {labels.official}</span>}</div>
          </div>
          <button className={confirmed?"secondary":"primary"} disabled={busy===r.id||confirmed} onClick={()=>void confirmPayment(r.id)} style={{minHeight:44,minWidth:170,whiteSpace:"nowrap"}}>{busy===r.id?"…":confirmed?t.participantStatuses.confirmed:t.confirmPayment}</button>
        </article>;
      })}
    </div>
  </div>;
}
