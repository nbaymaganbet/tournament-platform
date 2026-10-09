"use client";
import { uiText } from "@/lib/ui-text";
import { useLocale } from "@/components/locale-provider";


import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export type TieCategory={id:string;name:string;athletes:{id:string;name:string;wins:number}[]};

export default function RoundRobinTies({categories}:{categories:TieCategory[]}){
 const locale = useLocale();const L = (text: string) => uiText(locale, text);

 const router=useRouter();
 const [orders,setOrders]=useState<Record<string,string[]>>({});
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 async function save(category:TieCategory){
  setBusy(category.id);setError("");
  const order=orders[category.id]??category.athletes.map(a=>a.id);
  const {error:failure}=await createClient().rpc("resolve_round_robin_tie",{p_category_id:category.id,p_order:order});
  if(failure)setError(failure.message);else router.refresh();
  setBusy("");
 }
 return <>{categories.map(category=>{
  const order=orders[category.id]??category.athletes.map(a=>a.id);
  const athletes=order.map(id=>category.athletes.find(a=>a.id===id)!).filter(Boolean);
  return <section className="form-card" key={category.id} style={{marginBottom:16}}>
   <h2>{category.name} · {L("Круговая система")}</h2>
   <p className="muted">{L("Все бои завершены. Равенство трёх и более спортсменов по числу побед: расположите спортсменов с одинаковым числом побед в порядке итоговых мест.")}</p>
   {athletes.map((athlete,index)=><div className="participant-card" key={athlete.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:8}}>
    <span>{index+1}. {athlete.name} · {L("побед:")} {athlete.wins}</span>
    <span style={{display:"flex",gap:8}}><button type="button" className="secondary" aria-label={`${L("Поднять ")}${athlete.name}`} disabled={busy!==""||index===0||athletes[index-1].wins!==athlete.wins} onClick={()=>setOrders({...orders,[category.id]:athletes.map(a=>a.id).map((id,i,all)=>i===index-1?all[index]:i===index?all[index-1]:id)})}>↑</button>
    <button type="button" className="secondary" aria-label={`${L("Опустить ")}${athlete.name}`} disabled={busy!==""||index===athletes.length-1||athletes[index+1].wins!==athlete.wins} onClick={()=>setOrders({...orders,[category.id]:athletes.map(a=>a.id).map((id,i,all)=>i===index?all[index+1]:i===index+1?all[index]:id)})}>↓</button></span>
   </div>)}
   <button type="button" className="primary" disabled={busy!==""} onClick={()=>save(category)}>{L("Утвердить места")}</button>
  </section>;
 })}{error&&<p role="alert" className="error-message">{error}</p>}</>;
}

