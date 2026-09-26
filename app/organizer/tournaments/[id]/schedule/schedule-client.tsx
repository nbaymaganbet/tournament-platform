"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {translations,type Locale} from "@/lib/i18n";

type Category={id:string;name:string;count:number;preferred_mat_id:string|null};
type Mat={id:string;name:string;is_active:boolean};
export default function ScheduleClient({tournamentId,initialCategories,mats,startTime,scheduledCount}:{tournamentId:string;initialCategories:Category[];mats:Mat[];startTime:string;scheduledCount:number}){
 const[locale]=useState<Locale>(()=>typeof window!=="undefined"&&localStorage.getItem("tp-lang")==="kk"?"kk":"ru");
 const t=translations[locale];
 const[categories,setCategories]=useState(initialCategories),[zones,setZones]=useState(mats);
 const[hour,setHour]=useState((startTime||"10:00").slice(0,2)),[minute,setMinute]=useState((startTime||"10:00").slice(3,5));
 const[saving,setSaving]=useState<string|null>(null),[message,setMessage]=useState("");
 const s=useMemo(()=>createClient(),[]);
 const validTime=/^\d{1,2}$/.test(hour)&&/^\d{1,2}$/.test(minute)&&Number(hour)<=23&&Number(minute)<=59;
 const startTimeInput=`${hour.padStart(2,"0")}:${minute.padStart(2,"0")}`;
 useEffect(()=>{const refresh=async()=>{const{data}=await s.from("mats").select("id,name,is_active").eq("tournament_id",tournamentId).order("sort_order");if(data)setZones(data)};window.addEventListener("tournament-zones-changed",refresh);return()=>window.removeEventListener("tournament-zones-changed",refresh)},[s,tournamentId]);
 async function setCategoryZone(c:Category,matId:string){setSaving(c.id);setMessage("");const{error}=await s.rpc("set_category_schedule_zone",{p_category_id:c.id,p_mat_id:matId||null});if(error)setMessage(error.message);else setCategories(current=>current.map(x=>x.id===c.id?{...x,preferred_mat_id:matId||null}:x));setSaving(null)}
 async function saveStart(){if(!validTime){setMessage("Укажите время от 00:00 до 23:59.");return}setSaving("time");setMessage("");const{error}=await s.rpc("save_tournament_schedule_start_time",{p_tournament_id:tournamentId,p_start_time:startTimeInput});setMessage(error?error.message:locale==="kk"?"Басталу уақыты сақталды.":"Время начала сохранено.");setSaving(null)}
 async function generate(){if(!validTime){setMessage("Укажите время от 00:00 до 23:59.");return}setSaving("generate");setMessage("");const saved=await s.rpc("save_tournament_schedule_start_time",{p_tournament_id:tournamentId,p_start_time:startTimeInput});if(saved.error){setMessage(saved.error.message);setSaving(null);return}const result=await s.rpc("generate_tournament_schedule",{p_tournament_id:tournamentId});if(result.error){setMessage(result.error.message);setSaving(null);return}window.location.reload()}
 return <details className="schedule-controls form-card">
   <summary className="schedule-summary">{locale==="kk"?"Жарыс кестесі":"Расписание турнира"}{scheduledCount>0?` · ${scheduledCount}`:""}</summary>
   <p className="muted">{locale==="kk"?"Санаттарға аймақтарды таңдаңыз немесе автоматты бөлуді қалдырыңыз.":"Назначьте зоны категориям или оставьте автоматическое распределение."}</p>
   <div className="schedule-time-label">{locale==="kk"?"Жарыстың басталуы":"Начало соревнований"}</div>
   <div className="schedule-time-fields" role="group" aria-label={locale==="kk"?"Жарыстың басталу уақыты":"Время начала соревнований"}>
     <input className="field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={locale==="kk"?"Сағат":"Часы"} placeholder="ЧЧ" value={hour} onChange={e=>setHour(e.target.value.replace(/\D/g,""))}/>
     <span aria-hidden="true">:</span>
     <input className="field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={locale==="kk"?"Минут":"Минуты"} placeholder="ММ" value={minute} onChange={e=>setMinute(e.target.value.replace(/\D/g,""))}/>
   </div>
   <button className="primary schedule-save" type="button" disabled={!!saving} onClick={()=>void saveStart()}>{saving==="time"?"Сохраняем…":locale==="kk"?"Уақытты сақтау":"Сохранить время"}</button>
   <div className="schedule-category-list">{categories.map(c=><label className="schedule-category" key={c.id}>
     <span><strong>{c.name}</strong><small>{c.count} {locale==="kk"?"жекпе-жек":"боёв"}</small></span>
     <select aria-label={`${c.name}: ${locale==="kk"?"аймақ":"зона"}`} disabled={!!saving} value={c.preferred_mat_id??""} onChange={e=>void setCategoryZone(c,e.target.value)}>
       <option value="">{locale==="kk"?"Автоматты түрде":"Автоматически"}</option>
       {zones.filter(z=>z.is_active||z.id===c.preferred_mat_id).map(z=><option key={z.id} value={z.id}>{z.name}{z.is_active?"":" (выключена)"}</option>)}
     </select>
   </label>)}</div>
   <button className="primary schedule-generate" type="button" disabled={!!saving||scheduledCount>0} onClick={()=>void generate()}>{saving==="generate"?t.generating:scheduledCount>0?(locale==="kk"?"Кесте құрылды":"Расписание сформировано"):t.generateSchedule}</button>
   {scheduledCount>0&&<p className="muted">{locale==="kk"?"Келесі дайын жекпе-жектер кезекке автоматты түрде қосылады. Кезек «Өткізу» бөлімінде.":"Следующие готовые бои появятся в очереди автоматически. Очередь находится во вкладке «Проведение»."}</p>}
   {message&&<p className="muted" role="status">{message}</p>}
   <style jsx>{`
     .schedule-controls{width:100%;padding:20px;margin-bottom:18px}.schedule-summary{cursor:pointer;font-size:22px;font-weight:800}.schedule-controls>p{margin:10px 0}
     .schedule-time-label{margin-top:16px}.schedule-time-fields{display:flex;align-items:center;gap:7px;width:max-content;max-width:100%;margin-top:8px}
     .schedule-time-fields input{width:66px;min-width:0;min-height:46px;padding:8px;text-align:center;font-variant-numeric:tabular-nums}.schedule-time-fields span{font-size:22px;font-weight:700}
     .schedule-save,.schedule-generate{display:block;margin-top:12px}.schedule-category-list{display:grid;gap:8px;margin-top:18px}
     .schedule-category{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,200px);align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:10px}
     .schedule-category span{display:grid;gap:2px;min-width:0}.schedule-category small{color:var(--muted)}.schedule-category select{min-width:0;min-height:40px}
     @media(max-width:600px){.schedule-controls{padding:16px}.schedule-category{grid-template-columns:1fr}.schedule-category select{width:100%}}
   `}</style>
 </details>;
}
