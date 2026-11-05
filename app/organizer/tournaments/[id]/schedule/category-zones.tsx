"use client";
import {useEffect,useMemo,useState} from "react";
import {ActionScope,useActionFeedback} from "@/components/action-feedback";
import {useLocale} from "@/components/locale-provider";
import {createClient} from "@/lib/supabase/client";
type Category={id:string;name:string;count:number;preferred_mat_id:string|null};
type Mat={id:string;name:string;is_active:boolean};
export default function CategoryZones({tournamentId,initialCategories,mats}:{tournamentId:string;initialCategories:Category[];mats:Mat[]}){
 const kk=useLocale()==="kk";
 const[categories,setCategories]=useState(initialCategories),[zones,setZones]=useState(mats);
 const[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const s=useMemo(()=>createClient(),[]);
 const action=useActionFeedback(()=>setSaving(false));
 useEffect(()=>setCategories(initialCategories),[initialCategories]);
 useEffect(()=>setZones(mats),[mats]);
 useEffect(()=>{
  const refresh=async()=>{const{data}=await s.from("mats").select("id,name,is_active").eq("tournament_id",tournamentId).order("sort_order");if(data)setZones(data)};
  window.addEventListener("tournament-zones-changed",refresh);
  return()=>window.removeEventListener("tournament-zones-changed",refresh);
 },[s,tournamentId]);
 async function setCategoryZone(c:Category,matId:string){
  return action.run(async()=>{
   setSaving(true);setMessage("");
   const{error}=await s.rpc("set_category_schedule_zone",{p_category_id:c.id,p_mat_id:matId||null});
   if(error)setMessage(error.message);
   else setCategories(current=>current.map(row=>row.id===c.id?{...row,preferred_mat_id:matId||null}:row));
   setSaving(false);
  });
 }
 return <ActionScope pending={action.pending} error={action.error}><details className="category-zone-picker">
  <summary>{kk?"Санаттарға аймақ тағайындау":"Назначить зоны категориям"}</summary>
  <p className="muted">{kk?"Әдепкіде бөлу автоматты. Қажет болса, әр санатқа аймақ таңдаңыз.":"По умолчанию распределение автоматическое. При необходимости выберите зону для каждой категории."}</p>
  <div className="schedule-category-list">{categories.map(c=><label className="schedule-category" key={c.id}>
   <span><strong>{c.name}</strong><small>{c.count} {kk?"кездесу":"встреч"}</small></span>
   <select aria-label={`${c.name}: ${kk?"аймақ":"зона"}`} disabled={saving} value={c.preferred_mat_id??""} onChange={event=>void setCategoryZone(c,event.target.value)}>
    <option value="">{kk?"Автоматты түрде":"Автоматически"}</option>
    {zones.filter(z=>z.is_active||z.id===c.preferred_mat_id).map(z=><option key={z.id} value={z.id}>{z.name}{z.is_active?"":kk?" (өшірілген)":" (выключена)"}</option>)}
   </select>
  </label>)}</div>
  {message&&<p className="muted" role="status">{message}</p>}
 </details></ActionScope>;
}
