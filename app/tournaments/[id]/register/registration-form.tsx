"use client";
import { ActionScope, useActionFeedback } from "@/components/action-feedback";
import { useLocale } from "@/components/locale-provider";
import {divisionNames,type Division} from "@/lib/tournament-divisions";
import {useState} from "react";
import Link from "@/components/pending-link";
import {createClient} from "@/lib/supabase/client";
import {translations,type Locale} from "@/lib/i18n";

export type RegisteredParticipant = { id:string; first_name:string; last_name:string; age:number; weight:number; club:string|null; coach:string|null };

export default function RegistrationForm({tournamentId, categoryId, onRegistered, divisions=[]}:{tournamentId:string; categoryId?:string; onRegistered?:(participant:RegisteredParticipant)=>void;divisions?:Division[]}){
 const[form,setForm]=useState<Record<string,string>>({});const[busy,setBusy]=useState(false);const[result,setResult]=useState(false);const[error,setError]=useState("");const locale = useLocale();const t=translations[locale];const supabase=createClient();
 const [selectedDivisions,setSelectedDivisions]=useState<Division[]>(divisions.length===1?divisions:[]);
 const fields:[string,string,string][]=[["first_name",t.firstName,"text"],["last_name",t.lastName,"text"],["age",t.age,"number"],["weight",locale==="kk"?"Салмақ, кг":"Заявленный вес, кг","number"],["experience",t.experience,"text"],["phone",t.phone,"tel"],["city",locale==="kk"?"Қала":"Город","text"],["club",t.club,"text"],["coach",t.coach,"text"]];
 const requiredKeys=["first_name","last_name","age","weight"];
 const action = useActionFeedback(() => { setBusy(false); });
 async function submit(e:React.FormEvent){ e.preventDefault(); return action.run(async () => { setBusy(true);setError("");if(requiredKeys.some(key=>!form[key]?.trim())){setError(t.required);setBusy(false);return}const values={p_first_name:form.first_name.trim(),p_last_name:form.last_name.trim(),p_age:Number(form.age),p_weight:Number(form.weight),p_experience:form.experience?.trim()||null,p_phone:form.phone?.trim()||null,p_city:form.city?.trim()||null,p_club:form.club?.trim()||null,p_coach:form.coach?.trim()||null};
 if(categoryId){
  const {data,error}=await supabase.rpc("add_weigh_in_participant",{p_category_id:categoryId,...values});
  if(error||!data?.id){setError(error?.message?.includes("Duplicate registration")?t.duplicateRegistration:(error?.message||t.applicationError));setBusy(false);return;}
  setForm({});setBusy(false);onRegistered?.(data as RegisteredParticipant);return;
 }
 if(divisions.length && !selectedDivisions.length){setError(locale==="kk"?"Жарыс бөлімін таңдаңыз.":"Выберите раздел.");setBusy(false);return;}
 const{data,error}=await supabase.rpc("submit_tournament_registration",{p_tournament_id:tournamentId,...values,...(divisions.length?{p_divisions:selectedDivisions}:{})});if(error||!data?.[0]){const duplicate=error?.message?.includes("Duplicate registration");setError(duplicate?t.duplicateRegistration:(error?.message||t.applicationError));setBusy(false);return}setResult(true);setBusy(false) }); }
 if(result)return <div className="success-card registration-success" role="status"><div className="success-check" aria-hidden="true">✓</div><h2>{locale==="kk"?"Өтінім жіберілді":"Заявка отправлена"}</h2><p>{locale==="kk"?"Ұйымдастырушының растауын күтіңіз.":"Ожидайте подтверждения организатора."}</p><Link className="button-link" href={`/tournaments/${tournamentId}`}>{locale==="kk"?"Жарысқа оралу":"Вернуться к событию"}</Link></div>;

 return <ActionScope pending={action.pending} error={action.error} paused={true}>{<form className="form-grid" onSubmit={submit}>{divisions.length>0&&<fieldset><legend>{locale==="kk"?"Жарыс бөлімдері":"Разделы турнира"}</legend>{divisions.map(division=><label className="checkbox-row" key={division}><input type="checkbox" checked={selectedDivisions.includes(division)} disabled={busy||divisions.length===1} onChange={event=>setSelectedDivisions(current=>event.target.checked?[...current,division]:current.filter(item=>item!==division))}/>{divisionNames[division]}</label>)}</fieldset>}{fields.map(([key,label,type])=><label className="form-field" key={key}><span>{label}{requiredKeys.includes(key)&&" *"}</span>{key==="weight"&&<p className="muted">{locale==="kk"?"Нақты салмағыңызды килограмммен көрсетіңіз. Егер «… кг және одан жоғары» санатына қатыссаңыз, нақты салмағыңызды да көрсетіңіз.":"Укажите свой фактический вес в килограммах. Если вы участвуете в категории «от … кг и выше», также укажите свой фактический вес."}</p>}<input required={requiredKeys.includes(key)} type={type} value={form[key]??""} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}{error&&<div className="error-box">{error}</div>}<p className="muted">* {locale==="kk"?"Міндетті өрістер":"Обязательные поля"}</p><button className="primary submit-button" disabled={busy} type="submit">{busy?t.sending:categoryId?(locale==="kk"?"Қатысушы қосу":"Добавить участника"):t.submit}</button></form>}</ActionScope>;
}

