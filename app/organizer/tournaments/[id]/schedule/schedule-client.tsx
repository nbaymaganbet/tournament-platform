"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {translations,type Locale} from "@/lib/i18n";

type Row={id:string;match_id:string;scheduled_order:number|null;mat_id:string|null;approximate_time:string|null;match_number:number|null;category_name:string;athletes:string};
type Mat={id:string;name:string;is_active:boolean};

export default function ScheduleClient({tournamentId,initialRows,mats,startTime}:{tournamentId:string;initialRows:Row[];mats:Mat[];startTime:string}){
 const[locale]=useState<Locale>(()=>typeof window!=="undefined"&&localStorage.getItem("tp-lang")==="kk"?"kk":"ru");
 const t=translations[locale];
 const[rows,setRows]=useState(initialRows);
 const[zones,setZones]=useState(mats);
 const[hour,setHour]=useState((startTime||"10:00").slice(0,2));
 const[minute,setMinute]=useState((startTime||"10:00").slice(3,5));
 const[saving,setSaving]=useState<string|null>(null),[message,setMessage]=useState("");
 const[dragged,setDragged]=useState<number|null>(null);
 const s=useMemo(()=>createClient(),[]);
 const validTime=/^\d{1,2}$/.test(hour)&&/^\d{1,2}$/.test(minute)&&Number(hour)<=23&&Number(minute)<=59;
 const startTimeInput=`${hour.padStart(2,"0")}:${minute.padStart(2,"0")}`;

 useEffect(()=>{
   const refreshZones=async()=>{const{data}=await s.from("mats").select("id,name,is_active").eq("tournament_id",tournamentId).order("sort_order");if(data)setZones(data)};
   window.addEventListener("tournament-zones-changed",refreshZones);
   return()=>window.removeEventListener("tournament-zones-changed",refreshZones);
 },[s,tournamentId]);

 async function refreshRows(){
   if(!rows.length)return;
   const{data,error}=await s.from("match_schedule").select("id,scheduled_order,mat_id,approximate_time").in("id",rows.map(r=>r.id));
   if(error){setMessage(error.message);return}
   const updated=new Map((data??[]).map(r=>[r.id,r]));
   setRows(current=>current.map(r=>({...r,...updated.get(r.id)})).sort((a,b)=>(a.scheduled_order??0)-(b.scheduled_order??0)));
 }
 async function persist(next:Row[]){
   setSaving("save");setMessage("");
   const{error}=await s.rpc("reorder_tournament_schedule",{p_tournament_id:tournamentId,p_match_ids:next.map(r=>r.match_id)});
   if(error)setMessage(error.message);
   else{await refreshRows();setMessage(t.scheduleSaved)}
   setSaving(null);
 }
 async function move(index:number,dir:number){
   const target=index+dir;if(target<0||target>=rows.length)return;
   const next=[...rows];[next[index],next[target]]=[next[target],next[index]];await persist(next);
 }
 async function dropAt(target:number){
   if(dragged===null||dragged===target)return;
   const next=[...rows];const[item]=next.splice(dragged,1);next.splice(target,0,item);setDragged(null);await persist(next);
 }
 async function setZone(id:string,zoneId:string){
   setSaving(id);setMessage("");
   const{error}=await s.from("match_schedule").update({mat_id:zoneId||null}).eq("id",id);
   if(error)setMessage(error.message);
   else{
     const result=await s.rpc("refresh_tournament_schedule_times",{p_tournament_id:tournamentId});
     if(result.error)setMessage(result.error.message);
     else{await refreshRows();setMessage(t.matUpdated)}
   }
   setSaving(null);
 }
 async function saveStart(){
   if(!validTime){setMessage(locale==="kk"?"Уақытты 00:00–23:59 аралығында енгізіңіз.":"Укажите время от 00:00 до 23:59.");return}
   setSaving("time");setMessage("");
   const{error}=await s.rpc("save_tournament_schedule_start_time",{p_tournament_id:tournamentId,p_start_time:startTimeInput});
   if(error)setMessage(error.message);
   else{await refreshRows();setMessage(locale==="kk"?"Басталу уақыты сақталды.":"Время начала сохранено.")}
   setSaving(null);
 }
 async function generate(){
   if(!validTime){setMessage(locale==="kk"?"Уақытты 00:00–23:59 аралығында енгізіңіз.":"Укажите время от 00:00 до 23:59.");return}
   setSaving("generate");setMessage("");
   const saved=await s.rpc("save_tournament_schedule_start_time",{p_tournament_id:tournamentId,p_start_time:startTimeInput});
   if(saved.error){setMessage(saved.error.message);setSaving(null);return}
   const result=await s.rpc("generate_tournament_schedule",{p_tournament_id:tournamentId});
   if(result.error){setMessage(result.error.message);setSaving(null);return}
   window.location.reload();
 }
 const time=(value:string|null)=>value?new Date(value).toLocaleTimeString(locale==="kk"?"kk-KZ":"ru-RU",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Almaty"}):"—";

 return <div className="schedule-controls">
   <section className="form-card">
     <div className="eyebrow">{locale==="kk"?"ЖАРЫС КЕСТЕСІ":"РАСПИСАНИЕ ТУРНИРА"}</div>
     <h2>{locale==="kk"?"Жарыс кестесі":"Расписание турнира"}</h2>
     <div className="schedule-time-label">{locale==="kk"?"Жарыстың басталуы":"Начало соревнований"}</div>
     <div className="schedule-time-fields" role="group" aria-label={locale==="kk"?"Жарыстың басталу уақыты":"Время начала соревнований"}>
       <input className="field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={locale==="kk"?"Сағат":"Часы"} placeholder="ЧЧ" value={hour} onChange={e=>setHour(e.target.value.replace(/\D/g, ""))}/>
       <span aria-hidden="true">:</span>
       <input className="field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={locale==="kk"?"Минут":"Минуты"} placeholder="ММ" value={minute} onChange={e=>setMinute(e.target.value.replace(/\D/g, ""))}/>
     </div>
     <div className="schedule-config-actions"><button className="primary" type="button" disabled={!!saving} onClick={()=>void saveStart()}>{saving==="time"?"Сохраняем…":locale==="kk"?"Уақытты сақтау":"Сохранить время"}</button></div>
   </section>
   <div className="schedule-generate-actions"><button className="primary" disabled={!!saving} onClick={()=>void generate()}>{saving==="generate"?t.generating:rows.length?(locale==="kk"?"Жаңа жекпе-жектерді қосу":"Добавить новые бои"):t.generateSchedule}</button></div>
   {message&&<div className="muted schedule-message" role="status">{message}</div>}
   {rows.length===0?<div className="empty-state">{locale==="kk"?"Кесте әзірге бос. Алдымен торлар мен белсенді аймақтарды жасаңыз.":"Расписание пока пустое. Сначала создайте сетки и активные зоны."}</div>:
   <div className="schedule-edit-list">
     {rows.map((r,i)=><div className="schedule-edit-row" key={r.id} draggable={!saving} onDragStart={()=>setDragged(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>void dropAt(i)} onDragEnd={()=>setDragged(null)} style={{opacity:dragged===i?0.7:1,cursor:saving?"default":"grab"}}>
       <div className="schedule-fight"><strong><span className="schedule-drag-hint" aria-hidden="true">☷ </span>#{r.scheduled_order??i+1} · {locale==="kk"?"Жекпе-жек":"Бой"} #{r.match_number??"—"}</strong><span className="schedule-category">{r.category_name}</span><span className="schedule-athletes" title={r.athletes}>{r.athletes}</span><span className="muted schedule-approximate">{locale==="kk"?"Шамамен":"Примерно"}: {time(r.approximate_time)}</span></div>
       <button type="button" disabled={!!saving||i===0} onClick={()=>void move(i,-1)}>↑</button>
       <button type="button" disabled={!!saving||i===rows.length-1} onClick={()=>void move(i,1)}>↓</button>
       <select disabled={!!saving} value={r.mat_id??""} onChange={e=>void setZone(r.id,e.target.value)}>
         <option value="">{t.noMat}</option>
         {zones.filter(z=>z.is_active||z.id===r.mat_id).map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
       </select>
     </div>)}
   </div>}
   <style jsx>{`
     .schedule-controls{display:grid;gap:12px;margin-bottom:18px}
     .schedule-controls .form-card{width:100%;padding:20px}
     .schedule-controls label{display:grid;gap:8px;max-width:260px}
     .schedule-time-label{margin-top:8px}
     .schedule-time-fields{display:flex;align-items:center;gap:7px;width:max-content;max-width:100%;margin-top:8px}
     .schedule-time-fields input{width:66px;min-width:0;min-height:46px;padding:8px;text-align:center;font-variant-numeric:tabular-nums}
     .schedule-time-fields span{font-size:22px;font-weight:700}
     .schedule-config-actions,.schedule-generate-actions{display:flex;justify-content:flex-start;margin-top:12px}
     .schedule-message{margin:0 2px}
     .schedule-edit-list{display:grid;gap:8px}
     .schedule-edit-row{display:grid;grid-template-columns:minmax(150px,1fr) auto auto minmax(150px,220px);gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
     .schedule-fight{display:grid;gap:3px;min-width:0}
     .schedule-fight span{overflow-wrap:anywhere}
     .schedule-athletes{font-size:clamp(14px,2vw,16px);line-height:1.32;overflow-wrap:normal!important}
     .schedule-category,.schedule-approximate{font-size:14px;line-height:1.3}
     .schedule-edit-row button{min-width:40px;height:40px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);color:var(--text)}
     .schedule-edit-row select{min-height:40px}
     @media(max-width:760px){.schedule-controls .form-card{padding:16px}.schedule-edit-row{grid-template-columns:minmax(0,1fr) auto auto;gap:6px;padding:10px}.schedule-fight{gap:2px}.schedule-fight strong{font-size:16px}.schedule-drag-hint{display:none}.schedule-edit-row button{min-width:36px;height:36px}.schedule-edit-row select{grid-column:1/-1;width:100%;min-height:38px}}
   `}</style>
 </div>;
}
