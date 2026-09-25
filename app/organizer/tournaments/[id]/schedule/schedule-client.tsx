"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {translations,type Locale} from "@/lib/i18n";

type Row={id:string;match_id?:string;scheduled_order:number|null;mat_id:string|null};
type Mat={id:string;name:string;is_active:boolean};

export default function ScheduleClient({tournamentId,initialRows,mats,zoneCount,startTime}:{tournamentId:string;initialRows:Row[];mats:Mat[];zoneCount:number;startTime:string}){
 const[locale]=useState<Locale>(()=>typeof window!=="undefined"&&localStorage.getItem("tp-lang")==="kk"?"kk":"ru");
 const t=translations[locale];
 const[rows,setRows]=useState(initialRows);
 const[zoneCountInput,setZoneCountInput]=useState(String(zoneCount||1));
 const[startTimeInput,setStartTimeInput]=useState(startTime||"10:00");
 const[saving,setSaving]=useState<string|null>(null);
 const[message,setMessage]=useState("");
 const[dragged,setDragged]=useState<number|null>(null);
 const s=createClient();

 async function persist(next:Row[]){
   setSaving("save");setMessage("");
   const{error}=await s.rpc("reorder_tournament_schedule",{p_tournament_id:tournamentId,p_match_ids:next.map(r=>r.match_id??r.id)});
   if(error){setMessage(error.message);setSaving(null);return}
   setRows(next.map((r,i)=>({...r,scheduled_order:i+1})));setSaving(null);setMessage(t.scheduleSaved);
 }
 async function move(index:number,dir:number){
   const target=index+dir;if(target<0||target>=rows.length)return;
   const next=[...rows];[next[index],next[target]]=[next[target],next[index]];await persist(next);
 }
 async function dropAt(target:number){
   if(dragged===null||dragged===target)return;
   const next=[...rows];const[item]=next.splice(dragged,1);next.splice(target,0,item);setDragged(null);await persist(next);
 }
 async function setMat(id:string,matId:string){
   setSaving(id);
   const{error}=await s.from("match_schedule").update({mat_id:matId||null}).eq("id",id);
   if(error)setMessage(error.message);
   else{await s.rpc("refresh_tournament_schedule_times",{p_tournament_id:tournamentId});setRows(x=>x.map(r=>r.id===id?{...r,mat_id:matId||null}:r));setMessage(t.matUpdated)}
   setSaving(null);
 }
 async function saveConfig(){
   const n=Number(zoneCountInput);
   if(!Number.isInteger(n)||n<1||n>26){setMessage("Введите количество зон от 1 до 26");return}
   setSaving("config");setMessage("");
   const{error}=await s.rpc("configure_tournament_schedule",{p_tournament_id:tournamentId,p_zone_count:n,p_start_time:startTimeInput});
   if(error)setMessage(error.message);else setMessage("Настройки расписания сохранены.");
   setSaving(null);
 }
 async function generate(){
   const n=Number(zoneCountInput);
   if(!Number.isInteger(n)||n<1||n>26){setMessage("Введите количество зон от 1 до 26");return}
   setSaving("generate");setMessage("");
   let{error}=await s.rpc("configure_tournament_schedule",{p_tournament_id:tournamentId,p_zone_count:n,p_start_time:startTimeInput});
   if(error){setMessage(error.message);setSaving(null);return}
   const generated=await s.rpc("generate_tournament_schedule",{p_tournament_id:tournamentId});
   if(generated.error)setMessage(generated.error.message);else{setMessage(t.scheduleReady+": "+(generated.data??0));window.location.reload()}
   setSaving(null);
 }

 return <div className="schedule-controls">
   <section className="form-card">
     <div className="eyebrow">РАСПИСАНИЕ ТУРНИРА</div>
     <h2>Расписание турнира</h2>
     <div className="bracket-editor-grid">
       <label>Количество зон<input className="field" type="number" min={1} max={26} value={zoneCountInput} onChange={e=>setZoneCountInput(e.target.value.replace(/[^0-9]/g,""))}/></label>
       <label>Начало соревнований<input className="field" type="time" value={startTimeInput} onChange={e=>setStartTimeInput(e.target.value)}/></label>
     </div>
     <div className="schedule-config-actions">
       <button className="primary" type="button" disabled={!!saving} onClick={()=>void saveConfig()}>{saving==="config"?"Сохраняем…":"Сохранить настройки"}</button>
     </div>
   </section>
   <div className="schedule-generate-actions">
     <button className="primary" disabled={!!saving} onClick={generate}>{saving==="generate"?t.generating:t.generateSchedule}</button>
   </div>
   {message&&<div className="muted schedule-message">{message}</div>}
   <div className="schedule-edit-list">
     {rows.map((r,i)=><div className="schedule-edit-row" key={r.id} draggable={!saving} onDragStart={()=>setDragged(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>void dropAt(i)} onDragEnd={()=>setDragged(null)} style={{opacity:dragged===i ? 0.7 : 1,cursor:saving?"default":"grab"}}>
       <span title="Перетащите для изменения порядка">☷ #{r.scheduled_order??i+1}</span>
       <button disabled={!!saving||i===0} onClick={()=>move(i,-1)}>↑</button>
       <button disabled={!!saving||i===rows.length-1} onClick={()=>move(i,1)}>↓</button>
       <select disabled={!!saving} value={r.mat_id??""} onChange={e=>setMat(r.id,e.target.value)}>
         <option value="">{t.noMat}</option>
         {mats.filter(m=>m.is_active).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
       </select>
     </div>)}
   </div>
   <style jsx>{`
     .schedule-controls{display:grid;gap:12px;margin-bottom:18px}
     .schedule-controls .form-card{width:100%;padding:20px}
     .schedule-config-actions,.schedule-generate-actions{display:flex;justify-content:flex-start}
     .schedule-message{margin:0 2px}
     .schedule-edit-list{display:grid;gap:8px}
     .schedule-edit-row{display:grid;grid-template-columns:minmax(130px,1fr) auto auto minmax(170px,240px);gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
     .schedule-edit-row button{min-width:40px;height:40px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);color:var(--text)}
     .schedule-edit-row select{min-height:40px}
     @media(max-width:760px){.schedule-controls .form-card{padding:16px}.schedule-edit-row{grid-template-columns:1fr auto auto}.schedule-edit-row select{grid-column:1/-1;width:100%}}
   `}</style>
 </div>
}