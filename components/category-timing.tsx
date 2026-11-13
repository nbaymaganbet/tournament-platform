"use client";
import {useState,type FormEvent} from "react";
import {createClient} from "@/lib/supabase/client";
export type CategoryTimingValue={round_seconds:number|null;round_count:number|null;round_rest_seconds:number|null};
export const emptyTiming:CategoryTimingValue={round_seconds:null,round_count:null,round_rest_seconds:null};
function DurationFields({label,value,min,max,kk,disabled,onChange}:{
 label:string;value:number;min:number;max:number;kk:boolean;disabled:boolean;onChange:(value:number)=>void;
}){
 const minutes=Math.floor(value/60);
 const seconds=value%60;
 const maxMinutes=max/60;
 return <fieldset style={{border:0,padding:0,margin:0,minWidth:0}}>
  <legend style={{padding:0,marginBottom:6}}>{label}</legend>
  <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
   <label>{kk?"Минут":"Минуты"}<input className="field" type="number" min={0} max={maxMinutes} required disabled={disabled} value={minutes} onChange={event=>{
    const next=Number(event.target.value);
    if(Number.isInteger(next)&&next>=0&&next<=maxMinutes)onChange(next*60+(next===maxMinutes?0:seconds));
   }}/></label>
   <label>{kk?"Секунд":"Секунды"}<input className="field" type="number" min={minutes===0?min:0} max={minutes===maxMinutes?0:59} required disabled={disabled} value={seconds} onChange={event=>{
    const next=Number(event.target.value);
    if(Number.isInteger(next)&&next>=0&&next<60&&minutes*60+next<=max)onChange(minutes*60+next);
   }}/></label>
  </div>
 </fieldset>;
}
export function TimingFields({value,onChange,kk,disabled=false,group=false}:{value:CategoryTimingValue;onChange:(value:CategoryTimingValue)=>void;kk:boolean;disabled?:boolean;group?:boolean}){
 const enabled=value.round_seconds!==null;
 return <div><label className="checkbox-row"><input type="checkbox" disabled={disabled} checked={enabled} onChange={e=>onChange(e.target.checked?{round_seconds:300,round_count:1,round_rest_seconds:0}:emptyTiming)}/>{group?(kk?"Жас тобының кездесу уақыты":"Время встречи для возрастной группы"):(kk?"Санаттың кездесу уақыты":"Время встречи для категории")}</label>{enabled?<div className="form-grid">
 <DurationFields label={kk?"Раунд ұзақтығы":"Длительность раунда"} value={value.round_seconds??300} min={1} max={7200} kk={kk} disabled={disabled} onChange={seconds=>onChange({...value,round_seconds:seconds})}/>
 <label>{kk?"Раунд саны":"Количество раундов"}<input className="field" type="number" min={1} max={20} required disabled={disabled} value={value.round_count??1} onChange={e=>onChange({...value,round_count:Number(e.target.value)})}/></label>
 <DurationFields label={kk?"Раундтар арасындағы демалыс":"Отдых между раундами"} value={value.round_rest_seconds??0} min={0} max={3600} kk={kk} disabled={disabled} onChange={seconds=>onChange({...value,round_rest_seconds:seconds})}/>
 </div>:<p className="muted">{kk?"Жарыстың жалпы уақыт баптаулары қолданылады.":"Используются общие настройки времени турнира."}</p>}</div>;
}
export default function CategoryTiming({category,kk,onSaved,mixed}:{category:CategoryTimingValue&{id:string};kk:boolean;onSaved:(v:CategoryTimingValue)=>void;mixed:boolean}){
 const [value,setValue]=useState<CategoryTimingValue>({round_seconds:category.round_seconds,round_count:category.round_count,round_rest_seconds:category.round_rest_seconds});const[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{const{error}=await createClient().rpc("save_age_group_timing",{p_category_id:category.id,p_seconds:value.round_seconds,p_rounds:value.round_count,p_rest:value.round_rest_seconds});if(error)throw error;onSaved(value);}catch(error){setError(error instanceof Error?error.message:String((error as {message?:string})?.message??error))}finally{setBusy(false)}}
 return <details style={{marginBottom:16}} data-live-paused={busy||value.round_seconds!==category.round_seconds||value.round_count!==category.round_count||value.round_rest_seconds!==category.round_rest_seconds?"true":undefined}><summary>{kk?"Кездесу уақыты":"Время встречи"}</summary><form onSubmit={save}>{mixed&&<p className="muted">{kk?"Салмақ санаттарының уақыты әртүрлі. Сақтағанда осы уақыт бүкіл топқа қолданылады.":"У весовых категорий разное время. При сохранении выбранное время применится ко всей группе."}</p>}<TimingFields group value={value} onChange={setValue} kk={kk} disabled={busy}/><button type="submit" className="secondary" disabled={busy}>{kk?"Уақытты сақтау":"Сохранить время"}</button>{error&&<p role="alert" className="error">{error}</p>}</form></details>;
}
