"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { translations, type Locale } from "@/lib/i18n";

type Row = { id:string; participant_id:string; application_number:string|null; status:string; payment_status:string; first_name:string; last_name:string; age:number; weight:number; actual_weight:number|null; experience:string|null; phone:string|null; club:string|null; coach:string|null };

export default function ParticipantsClient({ tournamentId, initialRows }: { tournamentId:string; initialRows:Row[] }) {
  const [locale] = useState<Locale>(() => typeof window !== "undefined" && localStorage.getItem("tp-lang") === "kk" ? "kk" : "ru");
  const t = translations[locale];
  const labels=locale==="kk"?{weighIn:"Өлшеудегі салмақ",official:"ресми",edit:"Өзгерту",delete:"Өтінімді жою",menu:"Әрекеттер",confirm:"Өтінімді растау",confirmed:"Өтінім расталды",deleteConfirm:"Бұл өтінімді жою керек пе?",editSoon:"Өтінімді өзгерту формасы келесі қадамда қосылады."}:{weighIn:"Вес на взвешивании",official:"официальный",edit:"Изменить",delete:"Удалить заявку",menu:"Действия",confirm:"Подтвердить заявку",confirmed:"Заявка подтверждена",deleteConfirm:"Удалить эту заявку?",editSoon:"Форма редактирования заявки будет подключена следующим шагом."};
  const [rows,setRows]=useState(initialRows); const [query,setQuery]=useState(""); const [statusFilter,setStatusFilter]=useState("all"); const [busy,setBusy]=useState<string|null>(null); const [openMenu,setOpenMenu]=useState<string|null>(null); const supabase=createClient();
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase(); return rows.filter(r=>{const text=[r.first_name,r.last_name,r.club,r.coach,r.application_number,r.phone].filter(Boolean).join(" ").toLowerCase(); const confirmed=r.payment_status==="paid"&&r.status==="confirmed"; const statusOk=statusFilter==="all"||(statusFilter==="confirmed"?confirmed:!confirmed); return (!q||text.includes(q))&&statusOk;});},[rows,query,statusFilter]);

  async function confirmApplication(id:string){setBusy(id);setOpenMenu(null);const {data,error}=await supabase.from("registrations").update({payment_status:"paid",status:"confirmed"}).eq("id",id).eq("tournament_id",tournamentId).select("id,status,payment_status").single();if(!error&&data)setRows(c=>c.map(r=>r.id===id?{...r,...data}:r));if(error)window.alert(error.message);setBusy(null);}

  async function deleteApplication(row:Row){setOpenMenu(null);if(!window.confirm(labels.deleteConfirm))return;setBusy(`delete:${row.id}`);const{error}=await supabase.from("registrations").delete().eq("id",row.id).eq("tournament_id",tournamentId);if(error){window.alert(error.message);}else{setRows(c=>c.filter(r=>r.id!==row.id));}setBusy(null);}

  function editApplication(){setOpenMenu(null);window.alert(labels.editSoon);}

  async function saveActualWeight(row:Row,value:string){setBusy(`weight:${row.id}`);const parsed=value.trim()===""?null:Number(value);if(parsed!==null&&!Number.isFinite(parsed)){window.alert("Введите корректный вес.");setBusy(null);return}const{error}=await supabase.from("participants").update({actual_weight:parsed}).eq("id",row.participant_id);if(error)window.alert(error.message);else setRows(c=>c.map(r=>r.id===row.id?{...r,actual_weight:parsed}:r));setBusy(null);}

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
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:6}}><label style={{display:"flex",gap:6,alignItems:"center"}}><span className="muted">{labels.weighIn}</span><input className="field" style={{width:110}} type="number" min="0" step="0.1" defaultValue={r.actual_weight??""} id={`weight-${r.id}`} placeholder={`${r.weight}`} /></label><button className="secondary" disabled={busy===`weight:${r.id}`} onClick={()=>{const el=document.getElementById(`weight-${r.id}`) as HTMLInputElement|null;void saveActualWeight(r,el?.value??"")}}>{busy===`weight:${r.id}`?"…":locale==="kk"?"Салмақты сақтау":"Сохранить вес"}</button>{r.actual_weight!=null&&<span className="muted">{r.actual_weight} кг · {labels.official}</span>}</div>
          </div>
          <div style={{position:"relative",display:"flex",alignItems:"center",gap:8}}>
            <button className={confirmed?"secondary":"primary"} disabled={busy===r.id||confirmed} onClick={()=>void confirmApplication(r.id)} style={{minHeight:44,minWidth:170,whiteSpace:"nowrap"}}>{busy===r.id?"…":confirmed?labels.confirmed:labels.confirm}</button>
            <button type="button" className="secondary" aria-label={labels.menu} title={labels.menu} onClick={()=>setOpenMenu(openMenu===r.id?null:r.id)} style={{minHeight:44,minWidth:44,padding:"0 10px",fontSize:22,lineHeight:1}}>⋮</button>
            {openMenu===r.id&&<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",zIndex:20,minWidth:180,padding:6,borderRadius:10,background:"var(--surface,#171717)",border:"1px solid var(--border,#333)",boxShadow:"0 10px 30px rgba(0,0,0,.35)"}}>
              <button type="button" className="secondary" onClick={editApplication} style={{display:"block",width:"100%",textAlign:"left",marginBottom:4}}>{labels.edit}</button>
              <button type="button" className="danger-button" disabled={busy===`delete:${r.id}`} onClick={()=>void deleteApplication(r)} style={{display:"block",width:"100%",textAlign:"left"}}>{busy===`delete:${r.id}?"…":labels.delete}</button>
            </div>}
          </div>
        </article>;
      })}
    </div>
  </div>;
}
