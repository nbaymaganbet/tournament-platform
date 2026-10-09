"use client";
import { uiText } from "@/lib/ui-text";
import { useLocale } from "@/components/locale-provider";

import {useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Mat={id:string;name:string;sort_order:number;is_active:boolean};
export default function MatsClient({tournamentId,initialMats}:{tournamentId:string;initialMats:Mat[]}){
 const locale = useLocale();const L = (text: string) => uiText(locale, text);

 const[mats,setMats]=useState(initialMats);const[name,setName]=useState("");const[busy,setBusy]=useState(false);const s=createClient();
 async function add(e:React.FormEvent){e.preventDefault();if(!name.trim())return;setBusy(true);const nextOrder=Math.max(0,...mats.map(m=>m.sort_order))+1;const{data,error}=await s.from("mats").insert({tournament_id:tournamentId,name:name.trim(),sort_order:nextOrder,is_active:true}).select("id,name,sort_order,is_active").single();if(!error&&data){setMats(x=>[...x,data]);setName("");window.dispatchEvent(new Event("tournament-zones-changed"))}else if(error)alert(error.message);setBusy(false)}
 async function rename(m:Mat){const next=prompt(L("Название зоны"),m.name)?.trim();if(!next||next===m.name)return;const{error}=await s.from("mats").update({name:next}).eq("id",m.id).eq("tournament_id",tournamentId);if(!error){setMats(x=>x.map(a=>a.id===m.id?{...a,name:next}:a));window.dispatchEvent(new Event("tournament-zones-changed"))}else alert(error.message)}
 async function toggle(m:Mat){const{data,error}=await s.from("mats").update({is_active:!m.is_active}).eq("id",m.id).eq("tournament_id",tournamentId).select("id,is_active").single();if(!error&&data){setMats(x=>x.map(a=>a.id===m.id?{...a,...data}:a));window.dispatchEvent(new Event("tournament-zones-changed"))}}
 async function remove(m:Mat){if(!confirm(L("Удалить зону?")))return;const{error}=await s.from("mats").delete().eq("id",m.id).eq("tournament_id",tournamentId);if(!error){setMats(x=>x.filter(a=>a.id!==m.id));window.dispatchEvent(new Event("tournament-zones-changed"))}else alert(error.message)}
 return <section><form className="toolbar" onSubmit={add}><input className="field" value={name} onChange={e=>setName(e.target.value)} placeholder={L("Название, например Зона A")}/><button className="primary" disabled={busy}>{busy?L("Добавляем…"):L("Добавить зону")}</button></form><div className="category-list">{mats.length===0?<div className="empty-state">{L("Зон пока нет.")}</div>:mats.map(m=><article className="participant-card" key={m.id}><div className="participant-main"><strong>{m.name}</strong><span className="status">{m.is_active?L("Активен"):L("Выключен")}</span></div><div className="participant-actions"><button type="button" className="secondary" onClick={()=>rename(m)}>{L("Переименовать")}</button><button type="button" className="secondary" onClick={()=>toggle(m)}>{m.is_active?L("Выключить"):L("Включить")}</button><button type="button" className="danger-button" onClick={()=>remove(m)}>{L("Удалить")}</button></div></article>)}</div></section>
}

