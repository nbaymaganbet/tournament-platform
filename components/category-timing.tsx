"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
export type CategoryTimingValue={round_seconds:number|null;round_count:number|null;round_rest_seconds:number|null};
export const emptyTiming:CategoryTimingValue={round_seconds:null,round_count:null,round_rest_seconds:null};
export function TimingFields({value,onChange,kk,disabled=false}:{value:CategoryTimingValue;onChange:(value:CategoryTimingValue)=>void;kk:boolean;disabled?:boolean}){
 const enabled=value.round_seconds!==null;
 return <div><label className="checkbox-row"><input type="checkbox" disabled={disabled} checked={enabled} onChange={e=>onChange(e.target.checked?{round_seconds:300,round_count:1,round_rest_seconds:0}:emptyTiming)}/>{kk?"Санаттың кездесу уақыты":"Время встречи для категории"}</label>{enabled?<div className="form-grid">
 <label>{kk?"Раунд ұзақтығы, секунд":"Длительность раунда, секунд"}<input className="field" type="number" min={1} max={7200} required disabled={disabled} value={value.round_seconds??300} onChange={e=>onChange({...value,round_seconds:Number(e.target.value)})}/></label>
 <label>{kk?"Раунд саны":"Количество раундов"}<input className="field" type="number" min={1} max={20} required disabled={disabled} value={value.round_count??1} onChange={e=>onChange({...value,round_count:Number(e.target.value)})}/></label>
 <label>{kk?"Раундтар арасындағы демалыс, секунд":"Отдых между раундами, секунд"}<input className="field" type="number" min={0} max={3600} required disabled={disabled} value={value.round_rest_seconds??0} onChange={e=>onChange({...value,round_rest_seconds:Number(e.target.value)})}/></label>
 </div>:<p className="muted">{kk?"Жарыстың жалпы уақыт баптаулары қолданылады.":"Используются общие настройки времени турнира."}</p>}</div>;
}
export default function CategoryTiming({category,kk,onSaved}:{category:CategoryTimingValue&{id:string};kk:boolean;onSaved:(v:CategoryTimingValue)=>void}){
 const [value,setValue]=useState<CategoryTimingValue>({round_seconds:category.round_seconds,round_count:category.round_count,round_rest_seconds:category.round_rest_seconds});const[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(){setBusy(true);setError("");try{const{error}=await createClient().rpc("save_category_timing",{p_category_id:category.id,p_seconds:value.round_seconds,p_rounds:value.round_count,p_rest:value.round_rest_seconds});if(error)throw error;onSaved(value);}catch(error){setError(error instanceof Error?error.message:String((error as {message?:string})?.message??error))}finally{setBusy(false)}}
 return <details style={{marginBottom:16}} data-live-paused={busy||value.round_seconds!==category.round_seconds||value.round_count!==category.round_count||value.round_rest_seconds!==category.round_rest_seconds?"true":undefined}><summary>{kk?"Кездесу уақыты":"Время встречи"}</summary><TimingFields value={value} onChange={setValue} kk={kk} disabled={busy}/><button type="button" className="secondary" disabled={busy} onClick={()=>void save()}>{kk?"Сақтау":"Сохранить"}</button>{error&&<p role="alert" className="error">{error}</p>}</details>;
}
