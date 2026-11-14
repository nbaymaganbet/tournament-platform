"use client";
import { ActionScope, useActionFeedback } from "@/components/action-feedback";
import { useLocale } from "@/components/locale-provider";

import { useEffect, useMemo, useState } from "react";
import RegistrationForm, { type RegisteredParticipant } from "@/app/tournaments/[id]/register/registration-form";
import { createClient } from "@/lib/supabase/client";
import { divisionNames } from "@/lib/tournament-divisions";
import { translations, type Locale } from "@/lib/i18n";

type Person={id:string;first_name:string;last_name:string;age:number;weight:number;club:string|null;coach:string|null};
type Category={id:string;name:string;age_min:number|null;age_max:number|null;weight_limit:number|null;weight_allowance:number|null};
type TargetCategory={id:string;name:string;division:string;age_group_name:string|null};
type WeighIn={categoryId:string;weight:number|null;status:"pending"|"in_weight"|"out_of_weight"};

export default function WeighInClient({tournamentId,division,initialCategories,participants:initialParticipants,initialWeighIns,targetCategories=[],preferPopulatedCategory=false}:{tournamentId:string;division:string;initialCategories:Category[];participants:Person[];initialWeighIns:Record<string,WeighIn>;targetCategories?:TargetCategory[];preferPopulatedCategory?:boolean}){
 const locale = useLocale(); const t=translations[locale];
 const l=locale==="kk"?{declared:"Мәлімделген салмақ",actual:"Нақты салмақ",pending:"Өлшенбеген",inWeight:"Салмақта",outWeight:"Салмақта емес",confirmIn:"Салмақта",confirmOut:"Салмақта емес",move:"Басқа санатқа ауыстыру",remove:"Санаттан шығару",kg:"кг",empty:"Бұл санатта қатысушы жоқ",invalid:"Дұрыс салмақ енгізіңіз.",enterActual:"Алдымен нақты салмақты енгізіңіз."}:{declared:"Заявленный вес",actual:"Фактический вес",pending:"Не взвешен",inWeight:"В весе",outWeight:"Не в весе",confirmIn:"В весе",confirmOut:"Не в весе",move:"Перевести в категорию",remove:"Убрать из категории",kg:"кг",empty:"В этой категории нет участников",invalid:"Введите корректный вес.",enterActual:"Сначала введите фактический вес."};
 const [dirtyWeights,setDirtyWeights]=useState<Record<string,boolean>>({});
 const [participants,setParticipants]=useState(initialParticipants);
 const [existing,setExisting]=useState<{id:string;name:string}[]>([]);
 const [existingId,setExistingId]=useState("");
 const [showExisting,setShowExisting]=useState(false);
 const [showRegistration,setShowRegistration]=useState(false);
 const [extra, setExtra] = useState<{ participantId: string; target: string } | null>(null);
 const [showTransfer,setShowTransfer]=useState<Record<string,boolean>>({});
 function participantAdded(participant:RegisteredParticipant){
  setParticipants(rows=>[...rows,participant]);
  setWeighIns(rows=>({...rows,[`${selected}:${participant.id}`]:{categoryId:selected,weight:null,status:"pending"}}));
  setShowRegistration(false);
 }
 const categories=initialCategories;const [selected,setSelected]=useState(()=>{
  const populated=preferPopulatedCategory?initialCategories.find(c=>initialParticipants.some(p=>initialWeighIns[`${c.id}:${p.id}`])):undefined;
  return populated?.id??initialCategories[0]?.id??"";
 });const [weighIns,setWeighIns]=useState(initialWeighIns);const [moveTarget,setMoveTarget]=useState<Record<string,string>>({});const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState("");const supabase=createClient();
 useEffect(()=>{if(!busy&&!showRegistration&&!Object.keys(dirtyWeights).length){setParticipants(initialParticipants);setWeighIns(initialWeighIns)}},[initialParticipants,initialCategories,initialWeighIns]);
 useEffect(()=>{if(!showExisting)return;let cancelled=false;(async()=>{
  const {data:registrations,error}=await createClient().from("registrations").select("participant_id,participants(id,first_name,last_name)").eq("tournament_id",tournamentId).eq("division",division).in("status",["confirmed","pending_confirmation"]);
  if(error){setError(error.message);return;}
  const {data:assignments}=await createClient().from("category_participants").select("participant_id,categories!inner(tournament_id,division)").eq("is_active",true).eq("categories.tournament_id",tournamentId).eq("categories.division",division);
  if(cancelled)return;const assigned=new Set((assignments??[]).map(a=>a.participant_id));
  setExisting((registrations??[]).filter(r=>!assigned.has(r.participant_id)).map(r=>{const person=Array.isArray(r.participants)?r.participants[0]:r.participants;return {id:r.participant_id,name:`${person?.last_name??""} ${person?.first_name??""}`};}));
 })();return()=>{cancelled=true;};},[showExisting,tournamentId,division]);
 async function addExisting(){return action.run(async()=>{setBusy("existing");setError("");const {error}=await createClient().rpc("assign_registered_athlete",{p_category_id:selected,p_participant_id:existingId});if(error)setError(error.message);else{setShowExisting(false);setExistingId("");window.dispatchEvent(new Event("tp-action-finished"));}setBusy(null);});}
 const participantCounts=useMemo(()=>{
  const participantIds=new Set(participants.map(person=>person.id));
  const counts=new Map<string,number>();
  for(const [key,weighIn] of Object.entries(weighIns)){
   if(participantIds.has(key.slice(weighIn.categoryId.length+1))){
    counts.set(weighIn.categoryId,(counts.get(weighIn.categoryId)??0)+1);
   }
  }
  return counts;
 },[participants,weighIns]);
 const category=categories.find(c=>c.id===selected);const categoryParticipants=participants.filter(p=>weighIns[`${selected}:${p.id}`]);
 function saveWeight(id:string,value:string) {
  const key = `${selected}:${id}`;
  const weight = value.trim() === "" ? null : Number(value);
  if(weight !== null && (!Number.isFinite(weight) || weight <= 0)){setError(l.invalid);return;}
  setError("");
  setDirtyWeights(rows=>({...rows,[key]:true}));
  setWeighIns(rows=>({...rows,[key]:{categoryId:selected,weight,status:"pending"}}));
 }
 const action = useActionFeedback(() => { setBusy(null); });
 async function setStatus(id:string,status:"in_weight"|"out_of_weight"){ return action.run(async()=>{
  const key = `${selected}:${id}`;
  const weight = weighIns[key]?.weight;
  if(weight==null){setError(l.enterActual);return;}
  setBusy(`weigh:${id}`);setError("");
  const {data,error}=await supabase.rpc("set_category_weigh_in",{p_category_id:selected,p_participant_id:id,p_actual_weight:weight,p_status:status});
  if(error)setError(error.message);
  else {
   setWeighIns(rows=>({...rows,[key]:{categoryId:selected,weight,status:data?.weigh_in_status??status}}));
   setDirtyWeights(rows=>{const next={...rows};delete next[key];return next});
  }
  setBusy(null);
 }); }
 async function addCategory(id:string){ return action.run(async()=>{
  const target=extra?.target;
  if(!target||extra.participantId!==id)return;
  setBusy(`extra:${id}`);setError("");
  const {data,error}=await supabase.rpc("add_athlete_to_category",{p_from_category_id:selected,p_to_category_id:target,p_participant_id:id});
  if(error){
   setError(error.message.includes("actual weight in the source category first") ? (locale==="kk"?"Алдымен бастапқы санатта нақты салмақты тіркеңіз.":"Сначала зафиксируйте фактический вес в исходной категории.") : error.message.includes("after category fights start")?(locale==="kk"?"Бұл санатта жекпе-жектер басталды.":"В выбранной категории уже начались бои."):error.message);
  } else {
   if(data && targetCategories.some(c=>c.id===target && c.division===division)){
    const {data:entry}=await supabase.from("category_participants").select("weigh_in_weight,weigh_in_status").eq("category_id",target).eq("participant_id",id).maybeSingle();
    if(entry)setWeighIns(rows=>({...rows,[`${target}:${id}`]:{categoryId:target,weight:entry.weigh_in_weight,status:entry.weigh_in_status}}));
   }
   setExtra(null);
   window.dispatchEvent(new Event("tp-action-finished"));
  }
  setBusy(null);
 }); }
 async function move(id:string){ return action.run(async()=>{
  const target=moveTarget[id];
  const current=selected;
  if(!target||!weighIns[`${current}:${id}`])return;
  const targetName=categories.find(c=>c.id===target)?.name??"";
  if(!window.confirm(locale==="kk"?`Қатысушыны «${targetName}» санатына ауыстыру керек пе?`:`Перевести участника в категорию «${targetName}»?`))return;
  setBusy(`move:${id}`);setError("");
  const {data,error}=await supabase.rpc("transfer_category_participant",{p_from_category_id:current,p_to_category_id:target,p_participant_id:id});
  if(error){setError(error.message.includes("Cannot transfer after fights start")?(locale==="kk"?"Бастапқы немесе таңдалған санатта жекпе-жектер басталды. Ауыстыру мүмкін емес.":"В исходной или выбранной категории бои уже начались. Перевод невозможен."):error.message);setBusy(null);return;}
  setShowTransfer(rows=>({...rows,[id]:false}));
  setWeighIns(rows=>{
   const next={...rows};
   const weight=Number(data?.actual_weight??next[`${current}:${id}`]?.weight??0);
   delete next[`${current}:${id}`];
   next[`${target}:${id}`]={categoryId:target,weight,status:"in_weight"};
   return next;
  });
  setMoveTarget(rows=>{const next={...rows};delete next[id];return next});
  setBusy(null);
 }); }
 async function remove(id:string){ return action.run(async()=>{
  const key=`${selected}:${id}`;
  if(!weighIns[key])return;
  setBusy(`remove:${id}`);setError("");
  const {error}=await supabase.from("category_participants").update({is_active:false}).eq("category_id",selected).eq("participant_id",id);
  if(error){setError(error.message);setBusy(null);return;}
  setWeighIns(rows=>{const next={...rows};delete next[key];return next});
  setDirtyWeights(rows=>{const next={...rows};delete next[key];return next});
  setExtra(null);
  setBusy(null);
 }); }
 return <ActionScope pending={action.pending} error={action.error} paused={showExisting || showRegistration || extra !== null || Object.keys(dirtyWeights).length>0}>{<section className="categories-workspace"><div className="form-card"><label><strong>{locale==="kk"?"Салмақ санаты":"Весовая категория"}</strong><select className="field" value={selected} onChange={e=>{setSelected(e.target.value);setShowRegistration(false);setExtra(null);setShowTransfer({});setMoveTarget({})}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name} · {participantCounts.get(c.id)??0}</option>)}</select></label></div>{error&&<p className="error">{error}</p>}{category&&<div className="form-card"><h2>{category.name}</h2><p className="muted">{locale==="kk"?"Лимит":"Лимит"}: {category.weight_limit??"—"} {l.kg} · {locale==="kk"?"Рұқсат":"Допуск"}: +{category.weight_allowance??0} {l.kg}</p><button type="button" className="secondary" onClick={()=>setShowRegistration(value=>!value)}>{showRegistration?(locale==="kk"?"Бас тарту":"Отмена"):(locale==="kk"?"+ Қатысушы қосу":"+ Добавить участника")}</button><button type="button" className="secondary" style={{marginLeft:8}} onClick={()=>setShowExisting(v=>!v)}>{locale==="kk"?"Тіркелген қатысушыны таңдау":"Выбрать зарегистрированного"}</button>{showExisting&&<div className="form-card"><label>{locale==="kk"?"Санатсыз өтінімдер":"Заявки без категории"}<select value={existingId} onChange={e=>setExistingId(e.target.value)}><option value="">{locale==="kk"?"Қатысушыны таңдаңыз":"Выберите участника"}</option>{existing.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" className="primary" disabled={!existingId||!!busy} onClick={()=>void addExisting()}>{locale==="kk"?"Қатысушы қосу":"Добавить участника"}</button></div>}{showRegistration&&<RegistrationForm key={selected} tournamentId={tournamentId} categoryId={selected} onRegistered={participantAdded}/>}{categoryParticipants.length===0?<div className="empty-state">{l.empty}</div>:<div className="participants-list">{categoryParticipants.map(p=>{const wi=weighIns[`${selected}:${p.id}`];const targets=categories.filter(c=>!weighIns[`${c.id}:${p.id}`]);const additionalTargets=targetCategories.filter(c=>c.id!==selected&&!weighIns[`${c.id}:${p.id}`]);const recorded=wi?.status==="in_weight"||wi?.status==="out_of_weight";const rowBusy=busy===`weigh:${p.id}`||busy===`move:${p.id}`||busy===`remove:${p.id}`||busy===`extra:${p.id}`;return <article className="participant-card" key={p.id}><div className="participant-main"><div><strong>{p.last_name} {p.first_name}</strong><span className="muted">{l.declared}: {p.weight} {l.kg} · {p.age} {t.years} · {p.club||t.clubNotSet}</span><div style={{display:"flex",gap:8,alignItems:"end",flexWrap:"wrap",marginTop:10,opacity:recorded ? .5 : 1}}><label><span className="muted">{l.actual}</span><input className="field" style={{width:130}} type="number" min="0" step="0.1" disabled={recorded||rowBusy} value={wi?.weight??""} placeholder={`${p.weight}`} onChange={e=>saveWeight(p.id,e.target.value)}/></label><button type="button" className={wi?.status==="in_weight"?"primary":"secondary"} disabled={rowBusy||recorded} onClick={()=>void setStatus(p.id,"in_weight")}>{l.confirmIn}</button><button type="button" className={wi?.status==="out_of_weight"?"danger-button":"secondary"} disabled={rowBusy||recorded} onClick={()=>void setStatus(p.id,"out_of_weight")}>{l.confirmOut}</button></div>{!recorded&&<span className="muted">{wi?.weight==null?l.enterActual:l.pending}</span>}{additionalTargets.length>0&&<div style={{marginTop:10}}>
  <button type="button" className="secondary" disabled={rowBusy} aria-expanded={extra?.participantId===p.id} onClick={()=>setExtra(current=>current?.participantId===p.id?null:{participantId:p.id,target:""})}>
   {locale==="kk"?"Тағы бір санатқа қосу":"Добавить ещё в категорию"}
  </button>
  {extra?.participantId===p.id&&<div className="button-row" style={{marginTop:8}}>
   <select className="field" aria-label={locale==="kk"?"Қосымша санат":"Дополнительная категория"} value={extra.target} onChange={event=>setExtra({participantId:p.id,target:event.target.value})}>
    <option value="">{locale==="kk"?"Санатты таңдаңыз":"Выберите категорию"}</option>
    {(["gi","no_gi",""] as const).map(scope=>{
     const options=additionalTargets.filter(c=>c.division===scope);
     return options.length>0&&<optgroup key={scope} label={scope?divisionNames[scope]:(locale==="kk"?"Бөлімсіз":"Без раздела")}>
       {options.map(c=><option key={c.id} value={c.id}>{[c.age_group_name,c.name].filter(Boolean).join(" · ")}</option>)}
     </optgroup>;
    })}
   </select>
   <button type="button" className="secondary" disabled={!extra.target||rowBusy} onClick={()=>void addCategory(p.id)}>{t.add}</button>
  </div>}
 </div>}{recorded&&<button type="button" className="secondary" style={{marginTop:10}} disabled={rowBusy} onClick={()=>setShowTransfer(x=>({...x,[p.id]:!x[p.id]}))}>{showTransfer[p.id]?(locale==="kk"?"Бас тарту":"Отмена"):l.move}</button>}{recorded&&showTransfer[p.id]&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}><select className="field" value={moveTarget[p.id]??""} onChange={e=>setMoveTarget(x=>({...x,[p.id]:e.target.value}))}><option value="">{l.move}</option>{targets.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className="secondary" disabled={rowBusy||!moveTarget[p.id]} onClick={()=>void move(p.id)}>{locale==="kk"?"Ауыстыру":"Перевести"}</button></div>}</div><button type="button" className="danger-button" disabled={rowBusy} onClick={()=>void remove(p.id)}>{l.remove}</button></div></article>})}</div>}</div>}</section>}</ActionScope>;
}

