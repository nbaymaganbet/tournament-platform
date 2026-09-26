"use client";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

type Person={first_name:string;last_name:string;club:string|null};
type Match={id:string;match_number:number;round_number:number;status:string;category_id:string;participant_a_id:string|null;participant_b_id:string|null;winner_id:string|null;participantA?:Person|null;participantB?:Person|null};
type Slot={id:string;match_id:string;scheduled_order:number;approximate_time:string|null;mat_id:string|null};
const name=(p?:Person|null)=>p?`${p.last_name} ${p.first_name}`:"Ожидается участник";
export default function RunningClient({tournamentId,initialMatches,initialSchedule,categoryNames,zoneNames}:{tournamentId:string;initialMatches:Match[];initialSchedule:Slot[];categoryNames:Record<string,string>;zoneNames:Record<string,string>}){
 const[matches,setMatches]=useState(initialMatches),[schedule,setSchedule]=useState(initialSchedule);
 const[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState("");
 const s=useMemo(()=>createClient(),[]),router=useRouter();
 useEffect(()=>{setMatches(initialMatches)},[initialMatches]);
 useEffect(()=>{setSchedule(initialSchedule)},[initialSchedule]);
 useEffect(()=>{const update=()=>router.refresh();const a=s.channel(`running-matches-${tournamentId}`).on("postgres_changes",{event:"*",schema:"public",table:"matches",filter:`tournament_id=eq.${tournamentId}`},update).subscribe();
   const b=s.channel(`running-queue-${tournamentId}`).on("postgres_changes",{event:"*",schema:"public",table:"match_schedule"},update).subscribe();
   return()=>{void s.removeChannel(a);void s.removeChannel(b)}},[s,router,tournamentId]);
 const byId=new Map(matches.map(m=>[m.id,m]));
 const ordered=[...schedule].sort((a,b)=>a.scheduled_order-b.scheduled_order);
 const time=(v:string|null)=>v?new Date(v).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Almaty"}):"—";
 async function win(m:Match,id:string){if(!confirm(`Зафиксировать победу: ${name(id===m.participant_a_id?m.participantA:m.participantB)}?`))return;
   setBusy(m.id);setMessage("");const{error}=await s.rpc("record_match_winner",{p_match_id:m.id,p_winner_id:id});
   if(error)setMessage(error.message);else router.refresh();setBusy(null)}
 async function move(index:number,delta:number){const nextIndex=index+delta;if(nextIndex<0||nextIndex>=ordered.length)return;
   const first=byId.get(ordered[index].match_id),second=byId.get(ordered[nextIndex].match_id);
   if(!first||!second||first.status==="completed"||second.status==="completed")return;
   setBusy("order");setMessage("");const next=[...ordered];[next[index],next[nextIndex]]=[next[nextIndex],next[index]];
   const{error}=await s.rpc("reorder_tournament_schedule",{p_tournament_id:tournamentId,p_match_ids:next.map(r=>r.match_id)});
   if(error)setMessage(error.message);else router.refresh();setBusy(null)}
 return <section className="running-list">
   {message&&<p className="muted" role="alert">{message}</p>}
   {ordered.length===0?<div className="empty-state">Расписание пока не сформировано. Сначала откройте «Зоны и расписание».</div>:
   ordered.map((r,i)=>{const m=byId.get(r.match_id);if(!m)return null;const done=m.status==="completed";
     const previous=i>0?byId.get(ordered[i-1].match_id):null,next=i<ordered.length-1?byId.get(ordered[i+1].match_id):null;
     return <article className="running-card" key={r.id}>
       <div className="running-heading"><strong>Очередь #{r.scheduled_order} · Бой #{m.match_number}</strong><span className="status">{done?"Завершён":"Запланирован"}</span></div>
       <div className="running-meta"><span>{categoryNames[m.category_id]??"Категория"}</span><span>Раунд {m.round_number}</span><span>Зона: {r.mat_id?zoneNames[r.mat_id]??"—":"—"}</span><span>Примерно: {time(r.approximate_time)}</span></div>
       <div className="running-people">{([{"id":m.participant_a_id,"person":m.participantA},{"id":m.participant_b_id,"person":m.participantB}]).map((f,j)=><div className="running-person" key={j}>
         <span className="running-name"><strong>{name(f.person)}</strong>{f.person?.club&&<small>{f.person.club}</small>}</span>
         <button type="button" className="primary" disabled={done||!!busy||!f.id} onClick={()=>f.id&&void win(m,f.id)}>{m.winner_id===f.id?"Победил":"Победа"}</button>
       </div>)}</div>
       <div className="running-order"><button type="button" aria-label={`Поднять бой ${r.scheduled_order}`} disabled={!!busy||done||!previous||previous.status==="completed"} onClick={()=>void move(i,-1)}>↑</button><button type="button" aria-label={`Опустить бой ${r.scheduled_order}`} disabled={!!busy||done||!next||next.status==="completed"} onClick={()=>void move(i,1)}>↓</button></div>
     </article>})}
   <style jsx>{`
     .running-list{display:grid;gap:10px}.running-card{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
     .running-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.running-heading strong{font-size:17px}
     .running-meta{display:flex;gap:4px 12px;flex-wrap:wrap;color:var(--muted);font-size:14px;margin:8px 0 12px}
     .running-people{display:grid;gap:7px}.running-person{display:grid;grid-template-columns:minmax(0,1fr) 95px;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}
     .running-name{display:grid;gap:2px;min-width:0}.running-name strong{font-size:16px;line-height:1.3;overflow-wrap:break-word}.running-name small{color:var(--muted);font-size:13px}
     .running-person .primary{padding:9px 4px;font-size:13px;min-height:40px}.running-order{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
     .running-order button{width:40px;height:40px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);color:var(--text)}
     @media(max-width:600px){.running-card{padding:12px}.running-heading strong{font-size:16px}.running-person{grid-template-columns:minmax(0,1fr) 82px;gap:6px}.running-name strong{font-size:15px}}
   `}</style>
 </section>;
}
