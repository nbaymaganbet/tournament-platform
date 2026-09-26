"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Category={id:string;name:string};
type Person={id:string;first_name:string;last_name:string};
type Match={id:string;match_number:number;round_number:number;status:string;participant_a_id:string|null;participant_b_id:string|null;winner_id:string|null;next_match_id:string|null;category_id:string};
type ReadyCategory=Category&{count:number};
const personName=(p?:Person)=>p?`${p.last_name} ${p.first_name}`.trim():"Ожидается участник";

export default function BracketsClient({categories,tournamentId,isOwner}:{categories:Category[];tournamentId:string;isOwner:boolean}){
 const [matches,setMatches]=useState<Match[]>([]);
 const [people,setPeople]=useState<Record<string,Person>>({});
 const [readyCats,setReadyCats]=useState<ReadyCategory[]>([]);
 const [selected,setSelected]=useState<Record<string,string[]>>({});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [kk]=useState(()=>typeof window!=="undefined"&&localStorage.getItem("tp-lang")==="kk");
 const s=useMemo(()=>createClient(),[]);
 const L=kk?{title:"Жекпе-жек торлары",form:"Торларды қалыптастыру",forming:"Қалыптастырылуда…",ready:"Қалыптастыруға дайын санаттар",noneReady:"Әзірге қалыптастыруға дайын санаттар жоқ.",empty:"Жекпе-жектер әлі қалыптастырылған жоқ.",fight:"Жекпе-жек",round:"Кезең",waiting:"Қатысушы күтілуде",winner:"жекпе-жектің жеңімпазы",share:"WhatsApp арқылы бөлісу",choose:"Орындарын ауыстыру үшін екі спортшыны таңдаңыз.",swap:"Орындарын ауыстыру",saved:"Спортшылардың орындары ауыстырылды.",locked:"Жекпе-жек басталған соң орындарын ауыстыру мүмкін емес.",status:{completed:"Аяқталды",in_progress:"Өтіп жатыр",ready:"Дайын",scheduled:"Жоспарда"}}:{title:"Сетки",form:"Сформировать сетки",forming:"Формируем…",ready:"Готовые к формированию категории",noneReady:"Пока нет категорий, готовых к формированию сетки.",empty:"Бои ещё не сформированы.",fight:"Бой",round:"Раунд",waiting:"Ожидается участник",winner:"победитель боя",share:"Поделиться в WhatsApp",choose:"Выберите двух спортсменов, чтобы поменять их местами.",swap:"Поменять местами",saved:"Спортсмены поменялись местами.",locked:"После начала боёв перестановка недоступна.",status:{completed:"Завершён",in_progress:"Идёт",ready:"Готов",scheduled:"Запланирован"}};
 async function load(){
  const {data:m,error}=await s.from("matches").select("id,match_number,round_number,status,participant_a_id,participant_b_id,winner_id,next_match_id,category_id").eq("tournament_id",tournamentId).order("match_number");
  if(error){setMessage(error.message);return}
  const ids=[...new Set((m??[]).flatMap(x=>[x.participant_a_id,x.participant_b_id]).filter(Boolean) as string[])];
  const names:Record<string,Person>={};
  if(ids.length){const{data:p}=await s.from("participants").select("id,first_name,last_name").in("id",ids);for(const person of p??[])names[person.id]=person}
  setMatches(m??[]);setPeople(names);
  if(categories.length){
   const{data:cp}=await s.from("category_participants").select("category_id,participant_id,is_active,weigh_in_status").in("category_id",categories.map(c=>c.id));
   const pids=[...new Set((cp??[]).filter(x=>x.is_active&&x.weigh_in_status==="in_weight").map(x=>x.participant_id))];
   const{data:rg}=pids.length?await s.from("registrations").select("participant_id,status,payment_status").eq("tournament_id",tournamentId).in("participant_id",pids):{data:[] as {participant_id:string;status:string;payment_status:string}[]};
   const paid=new Set((rg??[]).filter(x=>x.status==="confirmed"&&x.payment_status==="paid").map(x=>x.participant_id));
   const counts=new Map<string,number>();
   for(const x of cp??[])if(x.is_active&&x.weigh_in_status==="in_weight"&&paid.has(x.participant_id))counts.set(x.category_id,(counts.get(x.category_id)??0)+1);
   const formed=new Set((m??[]).map(x=>x.category_id));
   setReadyCats(categories.map(c=>({...c,count:counts.get(c.id)??0})).filter(c=>c.count>=2&&!formed.has(c.id)));
  }
 }
 useEffect(()=>{void load()},[]);
 async function formBrackets(){
  setBusy(true);setMessage("");
  for(const c of readyCats){const{error}=await s.rpc("generate_single_elimination_bracket",{p_category_id:c.id});if(error){setMessage(error.message);setBusy(false);await load();return}}
  await load();setBusy(false);
 }
 function selectAthlete(categoryId:string,id:string){
  setSelected(current=>{const ids=current[categoryId]??[];const next=ids.includes(id)?ids.filter(x=>x!==id):ids.length<2?[...ids,id]:[ids[0],id];return {...current,[categoryId]:next}});
 }
 async function swap(categoryId:string){
  const ids=selected[categoryId]??[];if(ids.length!==2)return;
  setBusy(true);setMessage("");
  const{error}=await s.rpc("swap_bracket_participants",{p_category_id:categoryId,p_first_id:ids[0],p_second_id:ids[1]});
  if(error)setMessage(error.message);else{setSelected(current=>({...current,[categoryId]:[]}));await load();setMessage(L.saved)}
  setBusy(false);
 }
 function share(category:Category){
  const url=new URL(`/tournaments/${tournamentId}/brackets/${category.id}`,window.location.origin).toString();
  window.open(`https://wa.me/?text=${encodeURIComponent(`${category.name}\n${url}`)}`,"_blank","noopener,noreferrer");
 }
 const formedCategories=categories.filter(c=>matches.some(m=>m.category_id===c.id));
 return <section className="brackets-workspace">
  <div className="form-card"><div className="eyebrow">{L.title}</div><h2>{L.form}</h2><p className="muted">{L.ready}</p>{readyCats.length?<div style={{display:"grid",gap:8,marginBottom:12}}>{readyCats.map(c=><div key={c.id} style={{display:"flex",justifyContent:"space-between",gap:12}}><strong>{c.name}</strong><span className="muted">{c.count}</span></div>)}</div>:<p className="muted">{L.noneReady}</p>}<button type="button" className="primary" disabled={busy||!readyCats.length} onClick={()=>void formBrackets()}>{busy?L.forming:L.form}</button></div>
  {message&&<p className="error" role="status">{message}</p>}
  <div className="category-list">{formedCategories.map(category=>{
   const group=matches.filter(m=>m.category_id===category.id).sort((a,b)=>a.round_number-b.round_number||a.match_number-b.match_number);
   const locked=group.some(m=>m.winner_id||!(["scheduled","ready"].includes(m.status)));
   const picked=selected[category.id]??[];
   const name=(id:string|null)=>id?personName(people[id]):L.waiting;
   return <details key={category.id} className="form-card">
    <summary style={{cursor:"pointer",fontWeight:800,fontSize:18}}>{category.name} · {group.length} {kk?"жекпе-жек":"боёв"}</summary>
    <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}><button type="button" className="secondary" onClick={()=>share(category)}>{L.share}</button></div>
    {isOwner&&!locked&&<p className="muted">{L.choose}</p>}{isOwner&&locked&&<p className="muted">{L.locked}</p>}
    {group.map(m=><article key={m.id} className="participant-card" style={{display:"grid",gap:10,marginTop:12}}>
     <strong>{L.round} {m.round_number} · {L.fight} #{m.match_number}</strong>
     {(["participant_a_id","participant_b_id"] as const).map(side=>{const id=m[side];const previous=!id?group.find(x=>x.next_match_id===m.id):null;
      return <div key={side}>{id&&isOwner&&!locked?<button type="button" className={picked.includes(id)?"primary":"secondary"} disabled={busy} aria-pressed={picked.includes(id)} onClick={()=>selectAthlete(category.id,id)}>{name(id)}</button>:<strong>{id?name(id):previous?`${L.waiting}: ${L.winner} #${previous.match_number}`:L.waiting}</strong>}</div>})}
     <span className="status-pill">{L.status[m.status as keyof typeof L.status]??m.status}</span>
    </article>)}
    {isOwner&&!locked&&<button type="button" className="primary" style={{marginTop:12}} disabled={busy||picked.length!==2} onClick={()=>void swap(category.id)}>{L.swap}</button>}
   </details>})}</div>{formedCategories.length===0&&<div className="empty-state">{L.empty}</div>}
 </section>;
}
