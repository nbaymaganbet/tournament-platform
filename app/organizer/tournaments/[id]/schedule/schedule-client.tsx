"use client";
import { ActionScope, useActionFeedback } from "@/components/action-feedback";
import { divisionNames, type Division } from "@/lib/tournament-divisions";
import { uiText } from "@/lib/ui-text";

import { useLocale } from "@/components/locale-provider";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {translations} from "@/lib/i18n";

type DivisionStart = {division:Division;date:string;time:string;saved:boolean};

export default function ScheduleClient({tournamentId,startTime,scheduledCount,timing,divisionStarts=[]}:{tournamentId:string;startTime:string;scheduledCount:number;divisionStarts?:DivisionStart[];timing:{duration:number;gap:number;rest:number}}){
 const L = (text: string) => uiText(locale, text);

 const locale = useLocale();
 const t=translations[locale];
 const [starts,setStarts]=useState(divisionStarts);
 const [savedStarts,setSavedStarts]=useState(divisionStarts.filter(start=>start.saved));
 const[bout,setBout]=useState(timing);
 const[customTiming,setCustomTiming]=useState(false);
 const[timeDirty,setTimeDirty]=useState(false);
 const[hour,setHour]=useState((startTime||"10:00").slice(0,2)),[minute,setMinute]=useState((startTime||"10:00").slice(3,5));
 const[saving,setSaving]=useState<string|null>(null),[message,setMessage]=useState("");
 const s=useMemo(()=>createClient(),[]);
 useEffect(()=>{if(!timeDirty){setHour((startTime||"10:00").slice(0,2));setMinute((startTime||"10:00").slice(3,5))}},[startTime]);
 const validTime=/^\d{1,2}$/.test(hour)&&/^\d{1,2}$/.test(minute)&&Number(hour)<=23&&Number(minute)<=59;
 const startTimeInput=`${hour.padStart(2,"0")}:${minute.padStart(2,"0")}`;
 const action = useActionFeedback(() => { setSaving(null); });
 async function saveStart(){ return action.run(async () => { if(!validTime){setMessage(L("Укажите время от 00:00 до 23:59."));return}setSaving("time");setMessage("");const{error}=await s.rpc("save_tournament_schedule_start_time",{p_tournament_id:tournamentId,p_start_time:startTimeInput});if(!error)setTimeDirty(false);setMessage(error?error.message:locale==="kk"?"Басталу уақыты сақталды.":"Время начала сохранено.");setSaving(null) }); }
 async function saveDivision(start:DivisionStart) { return action.run(async()=>{
   if(!start.date||!start.time){setMessage(locale==="kk"?"Күн мен уақытты көрсетіңіз.":"Укажите дату и время.");return;}
   setSaving(start.division);setMessage("");
   const {error}=await s.rpc("save_division_start",{p_tournament_id:tournamentId,p_division:start.division,p_date:start.date,p_time:start.time});
   if(!error){
     const saved={...start,saved:true};
     setStarts(current=>current.map(item=>item.division===start.division?saved:item));
     setSavedStarts(current=>[...current.filter(item=>item.division!==start.division),saved]);
   }
   setMessage(error?error.message:locale==="kk"?"Сақталды":"Сохранено");setSaving(null);
 }); }
 function editDivision(division:Division,key:"date"|"time",value:string){
   setStarts(current=>current.map(item=>item.division===division?{...item,[key]:value,saved:false}:item));
 }
 async function saveTiming(){return action.run(async()=>{setSaving("timing");setMessage("");const {error}=await s.rpc("save_bout_timing",{p_tournament_id:tournamentId,p_duration:bout.duration,p_interval:bout.gap,p_rest:bout.rest});setMessage(error?error.message:locale==="kk"?"Сақталды":"Сохранено");setSaving(null);});}
 async function generate(){ return action.run(async () => { if(!validTime){setMessage(L("Укажите время от 00:00 до 23:59."));return}if(starts.some(start=>!start.saved)){setMessage(locale==="kk"?"Әр бөлімнің басталу күні мен уақытын сақтаңыз.":"Сохраните дату и время старта каждого раздела.");return}setSaving("generate");setMessage("");if(!starts.length||timeDirty){const saved=await s.rpc("save_tournament_schedule_start_time",{p_tournament_id:tournamentId,p_start_time:startTimeInput});if(saved.error){setMessage(saved.error.message);setSaving(null);return}}const result=await s.rpc("generate_tournament_schedule",{p_tournament_id:tournamentId});if(result.error){setMessage(result.error.message);setSaving(null);return}setTimeDirty(false);window.dispatchEvent(new Event("tp-action-finished")) }); }
 async function orderByStage(){
  if(!window.confirm(locale==="kk"?"Күтіп тұрған кездесулерді тор кезеңдері бойынша реттеу керек пе? Қолмен қойылған кезек өзгереді.":"Упорядочить предстоящие бои по этапам? Ручной порядок этих боёв будет заменён."))return;
  return action.run(async()=>{
   setSaving("stage");setMessage("");
   const {error}=await s.rpc("order_tournament_schedule_by_stage",{p_tournament_id:tournamentId});
   setMessage(error?error.message:locale==="kk"?"Кезек жаңартылды":"Очередь обновлена");
  });
 }
 return <ActionScope pending={action.pending} error={action.error} paused={timeDirty}>{<section className="schedule-controls form-card"><details>
   <summary className="schedule-summary">{locale==="kk"?"Жарыс кестесі":"Расписание турнира"}{scheduledCount>0?` · ${scheduledCount}`:""}</summary>

   <div className="schedule-time-label">{locale==="kk"?"Жарыстың басталуы":"Начало соревнований"}</div>
   <div className="schedule-time-fields" role="group" aria-label={locale==="kk"?"Жарыстың басталу уақыты":"Время начала соревнований"}>
     <input className="field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={locale==="kk"?"Сағат":"Часы"} placeholder={L("ЧЧ")} value={hour} onChange={e=>{setTimeDirty(true);setHour(e.target.value.replace(/\D/g,""))}}/>
     <span aria-hidden="true">:</span>
     <input className="field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={locale==="kk"?"Минут":"Минуты"} placeholder={L("ММ")} value={minute} onChange={e=>{setTimeDirty(true);setMinute(e.target.value.replace(/\D/g,""))}}/>
   </div>
   <button className="primary schedule-save" type="button" disabled={!!saving} onClick={()=>void saveStart()}>{saving==="time"?L("Сохраняем…"):locale==="kk"?"Уақытты сақтау":"Сохранить время"}</button>
   {starts.map(start=>{
     const saved=savedStarts.find(item=>item.division===start.division);
     const date=saved?new Intl.DateTimeFormat(locale==="kk"?"kk-KZ":"ru-RU",{day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(saved.date+"T00:00:00Z")):"";
     return <details className="filter-disclosure" key={start.division}>
     <summary>{divisionNames[start.division]} <span className="muted">· {saved?`${date}, ${saved.time}`:locale==="kk"?"Уақыт белгіленбеген":"Время не задано"}{saved&&!start.saved&&(locale==="kk"?" · Сақталмаған өзгерістер":" · Есть несохранённые изменения")}</span></summary>
     <div className="form-grid">
       <label>{locale==="kk"?"Басталу күні":"Дата старта"}<input className="field" type="date" disabled={!!saving} value={start.date} onChange={event=>editDivision(start.division,"date",event.target.value)}/></label>
       <label>{locale==="kk"?"Басталу уақыты":"Время старта"}<input className="field" type="time" disabled={!!saving} value={start.time} onChange={event=>editDivision(start.division,"time",event.target.value)}/></label>
     </div>
     <button className="secondary" type="button" disabled={!!saving} onClick={()=>void saveDivision(start)}>{locale==="kk"?"Сақтау":"Сохранить"}</button>
   </details>})}
   <label className="checkbox-row"><input type="checkbox" checked={customTiming} onChange={event=>setCustomTiming(event.target.checked)} aria-controls="schedule-timing-settings" aria-expanded={customTiming}/>{locale==="kk"?"Жалпы уақыт баптауларын өзгерту":"Изменить общие настройки времени"}</label>
   {customTiming&&<div id="schedule-timing-settings"><p className="muted">{locale==="kk"?"Ағымдағы мәндер көрсетілген. Әдепкіде: кездесу — 5 мин, аралық — 0 мин, спортшының демалысы — 5 мин. Оларды өзгертуге болады. Жалпы ұзақтық жеке уақыты жоқ санаттарға, ал аралық пен демалыс бүкіл турнирге қолданылады.":"Показаны текущие значения. По умолчанию: встреча — 5 мин, интервал — 0 мин, отдых спортсмена — 5 мин. Их можно изменить. Общая длительность применяется к категориям без своего времени, интервал и отдых — ко всему турниру."}</p>
   <div className="bracket-filters">{(["duration","gap","rest"] as const).map(key=><label key={key}>{key==="duration"?(locale==="kk"?"Жекпе-жек, мин":"Длительность встречи, мин"):key==="gap"?(locale==="kk"?"Аралық, мин":"Интервал, мин"):(locale==="kk"?"Спортшының демалысы, мин":"Отдых спортсмена, мин")}<input type="number" min={key==="duration"?1:0} max={key==="gap"?60:120} value={bout[key]} onChange={e=>setBout(v=>({...v,[key]:Number(e.target.value)}))}/></label>)}</div><button type="button" className="secondary" disabled={!!saving} onClick={()=>void saveTiming()}>{locale==="kk"?"Параметрлерді сақтау":"Сохранить параметры"}</button>
   </div>}

   </details>
   <button className="primary schedule-generate" type="button" disabled={!!saving} onClick={()=>void generate()}>{saving==="generate"?t.generating:scheduledCount>0?(locale==="kk"?"Кестені жаңарту":"Обновить расписание"):t.generateSchedule}</button>
   {scheduledCount>0&&<button className="secondary schedule-generate" type="button" disabled={!!saving} onClick={()=>void orderByStage()}>{locale==="kk"?"Кезеңдер бойынша реттеу":"Упорядочить по этапам"}</button>}
   {scheduledCount>0&&<p className="muted">{locale==="kk"?"Кезекте болашақ жекпе-жектерді қоса барлық кезеңдер бар. Кезек «Өткізу» бөлімінде.":"В очередь включены все раунды, включая будущие бои. Очередь находится во вкладке «Проведение»."}</p>}
   {message&&<p className="muted" role="status">{message}</p>}
   <style jsx>{`
     .schedule-controls{width:100%;padding:14px;margin-bottom:14px}.schedule-summary{cursor:pointer;font-size:16px;font-weight:750}.schedule-controls>p{margin:10px 0}
     .schedule-time-label{margin-top:16px}.schedule-time-fields{display:flex;align-items:center;gap:7px;width:max-content;max-width:100%;margin-top:8px}
     .schedule-time-fields input{width:66px;min-width:0;min-height:46px;padding:8px;text-align:center;font-variant-numeric:tabular-nums}.schedule-time-fields span{font-size:22px;font-weight:700}
     .schedule-save,.schedule-generate{display:block;margin-top:12px}
     @media(max-width:600px){.schedule-controls{padding:12px}}
   `}</style>
 </section>}</ActionScope>;
}

