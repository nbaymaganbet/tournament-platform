"use client";
import MatchScoreboard from "@/components/match-scoreboard";
import {victoryMethods,victoryLabel,type Scoreboard} from "@/lib/scoreboard";
import {useRef} from "react";
import {projectSchedule,nextMatchIds} from "@/lib/event-brackets";
import {pendingAthlete} from "@/lib/bracket-display";
import { ActionScope, useActionFeedback } from "@/components/action-feedback";
import { uiText } from "@/lib/ui-text";
import { useLocale } from "@/components/locale-provider";

import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

type Person={first_name:string;last_name:string;club:string|null};
type Match={duration_seconds?:number;round_seconds?:number;round_count?:number;round_rest_seconds?:number;scoreboard?:Scoreboard|null;id:string;match_number:number;round_number:number;status:string;category_id:string;participant_a_id:string|null;participant_b_id:string|null;winner_id:string|null;next_match_id:string|null;loser_next_match_id:string|null;started_at:string|null;completed_at:string|null;participantA?:Person|null;participantB?:Person|null};
type Slot={id:string;match_id:string;scheduled_order:number;approximate_time:string|null;mat_id:string|null};
export default function RunningClient({tournamentId,initialMatches,initialSchedule,categoryNames,zoneNames,timing}:{tournamentId:string;initialMatches:Match[];initialSchedule:Slot[];categoryNames:Record<string,string>;zoneNames:Record<string,string>;timing:{duration:number;gap:number;rest:number}}){
 const locale = useLocale();const L = (text: string) => uiText(locale, text);

 const name=(p?:Person|null)=>p?`${p.last_name} ${p.first_name}`:L("Ожидается участник");
 const[matches,setMatches]=useState(initialMatches),[schedule,setSchedule]=useState(initialSchedule);
 const[result,setResult]=useState<{match:Match;winner:string}|null>(null),[method,setMethod]=useState("points"),[scoreA,setScoreA]=useState(""),[scoreB,setScoreB]=useState("");
 const[boards,setBoards]=useState<Record<string,Scoreboard>>({});
 const resultDialog=useRef<HTMLDialogElement>(null);
 const[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState("");
 const[zoneFilter,setZoneFilter]=useState(""),[categoryFilter,setCategoryFilter]=useState("");
 const s=useMemo(()=>createClient(),[]),router=useRouter();
 useEffect(()=>{setMatches(initialMatches)},[initialMatches]);
 useEffect(()=>{setSchedule(initialSchedule)},[initialSchedule]);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer)},[]);
 const projected=projectSchedule(matches.map(m=>{const slot=schedule.find(s=>s.match_id===m.id);return {...m,mat_id:slot?.mat_id,scheduled_order:slot?.scheduled_order,approximate_time:slot?.approximate_time};}),timing.duration,timing.gap,timing.rest,now);
 const nextIds=nextMatchIds(projected);
 const forecast=new Map(projected.map(m=>[m.id,m]));
 const byId=new Map(matches.map(m=>[m.id,m]));
 const scheduled=[...schedule].sort((a,b)=>a.scheduled_order-b.scheduled_order);
 const ordered=[...scheduled].sort((a,b)=>{
   const aDone=byId.get(a.match_id)?.status==="completed",bDone=byId.get(b.match_id)?.status==="completed";
   return Number(aDone)-Number(bDone)||a.scheduled_order-b.scheduled_order;
 });
 const visible=ordered.filter(slot=>{
   const match=byId.get(slot.match_id);
   return !!match&&(!zoneFilter||slot.mat_id===zoneFilter)&&(!categoryFilter||match.category_id===categoryFilter);
 });
 const time=(v:string|null)=>v?new Date(v).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Almaty"}):"—";
 async function start(m:Match){return action.run(async()=>{setBusy(m.id);setMessage("");const {error}=await s.rpc("start_match",{p_match_id:m.id});if(error)setMessage(error.message);else router.refresh();setBusy(null);});}
 const action = useActionFeedback(() => { setBusy(null); });
 async function win(m:Match,id:string){return action.run(async()=>{
   setBusy(m.id);setMessage("");
   const{data,error}=await s.from("match_scoreboards").select("*").eq("match_id",m.id).maybeSingle();
   if(error){setMessage(error.message);setBusy(null);return;}
   const initial=data??boards[m.id]??m.scoreboard;
   setResult({match:m,winner:id});setMethod(m.status==="running"?"points":"walkover");setScoreA(initial?String(initial.score_a):"");setScoreB(initial?String(initial.score_b):"");resultDialog.current?.showModal();setBusy(null);
 });}
 async function confirmResult(){return action.run(async()=>{
   if(!result)return;
   if(method==="points"&&(!/^\d+$/.test(scoreA)||!/^\d+$/.test(scoreB)||Number(scoreA)>999||Number(scoreB)>999)){setMessage(locale==="kk"?"Екі ұпайды да енгізіңіз (0–999).":"Введите оба значения счёта (0–999).");return;}
   setBusy(result.match.id);setMessage("");
   const{error}=await s.rpc("record_match_result",{p_match_id:result.match.id,p_winner_id:result.winner,p_method:method,p_score_a:method==="points"?Number(scoreA):null,p_score_b:method==="points"?Number(scoreB):null});
   if(error)setMessage(error.message);else{setMatches(current=>current.map(m=>m.id===result.match.id?{...m,status:"completed",winner_id:result.winner}:m));resultDialog.current?.close();setResult(null);router.refresh()}setBusy(null);
 });}
 async function move(index:number,delta:number){ return action.run(async () => { const nextIndex=index+delta;if(nextIndex<0||nextIndex>=visible.length)return;
   const first=byId.get(visible[index].match_id),second=byId.get(visible[nextIndex].match_id);
   if(!first||!second||["completed","running"].includes(first.status)||["completed","running"].includes(second.status))return;
   setBusy("order");setMessage("");const next=[...scheduled];
   const firstIndex=next.findIndex(slot=>slot.match_id===visible[index].match_id);
   const secondIndex=next.findIndex(slot=>slot.match_id===visible[nextIndex].match_id);
   [next[firstIndex],next[secondIndex]]=[next[secondIndex],next[firstIndex]];
   const{error}=await s.rpc("reorder_tournament_schedule",{p_tournament_id:tournamentId,p_match_ids:next.map(r=>r.match_id)});
   if(error)setMessage(error.message);else router.refresh();setBusy(null) }); }
 return <ActionScope pending={action.pending} error={action.error} paused={result!==null}>{<section className="running-list">
   <div className="running-filters">
     <label><span>{locale==="kk"?"Аймақ / кілем":"Зона / ковер"}</span><select className="field" value={zoneFilter} onChange={e=>setZoneFilter(e.target.value)}>
       <option value="">{locale==="kk"?"Барлық аймақтар":"Все зоны"}</option>
       {Object.entries(zoneNames).map(([id,title])=><option key={id} value={id}>{title}</option>)}
     </select></label>
     <label><span>{locale==="kk"?"Санат":"Категория"}</span><select className="field" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
       <option value="">{locale==="kk"?"Барлық санаттар":"Все категории"}</option>
       {Object.entries(categoryNames).map(([id,title])=><option key={id} value={id}>{title}</option>)}
     </select></label>
   </div>
   <p className="muted">{locale==="kk"?"Қалған жекпе-жектер":"Осталось боёв"}: {matches.filter(m=>!["completed","cancelled"].includes(m.status)&&(!categoryFilter||m.category_id===categoryFilter)&&(!zoneFilter||schedule.some(s=>s.match_id===m.id&&s.mat_id===zoneFilter))).length}</p>
   {message&&<p className="muted" role="alert">{message}</p>}
   {ordered.length===0?<div className="empty-state">{L("Расписание пока не сформировано. Сначала откройте «Зоны и расписание».")}</div>:
   visible.length===0?<div className="empty-state">{locale==="kk"?"Таңдалған сүзгілер бойынша жекпе-жектер жоқ.":"По выбранным фильтрам поединков нет."}</div>:
   visible.map((r,i)=>{const m=byId.get(r.match_id);if(!m)return null;const done=m.status==="completed";
     const previous=i>0?byId.get(visible[i-1].match_id):null,next=i<visible.length-1?byId.get(visible[i+1].match_id):null;
     return <article className={`running-card${done?" running-card-done":""}`} key={r.id}>
       <div className="running-heading"><strong>#{m.match_number}</strong><span className="status">{done?L("Завершён"):m.status==="running"?(locale==="kk"?"Өтіп жатыр":"Идёт"):nextIds.has(m.id)?(locale==="kk"?"Келесі":"Следующий"):L("Запланирован")}</span></div>
       <div className="running-meta"><span>{categoryNames[m.category_id]??L("Категория")}</span><span>{locale==="kk"?"Тор кезеңі ":"Этап сетки "}{m.round_number}</span><span>{L("Зона: ")}{r.mat_id?zoneNames[r.mat_id]??"—":"—"}</span>{!done&&m.status!=="running"&&!nextIds.has(m.id)&&<span>≈ {time(forecast.get(m.id)?.approximate_time??r.approximate_time)}</span>}</div>
       {!done&&m.status!=="running"&&<button type="button" className="primary" disabled={!!busy||!m.participant_a_id||!m.participant_b_id||matches.some(x=>x.status==="running"&&schedule.some(s=>s.match_id===x.id&&s.mat_id===r.mat_id))} onClick={()=>void start(m)}>{locale==="kk"?"Бастау":"Начать"}</button>}
       <div className="running-people">{([{"id":m.participant_a_id,"person":m.participantA},{"id":m.participant_b_id,"person":m.participantB}]).map((f,j)=><div className="running-person" key={j}>
         <span className="running-name"><strong>{f.person?name(f.person):pendingAthlete(m,j===0?"a":"b",matches,locale==="kk")}</strong>{f.person?.club&&<small>{f.person.club}</small>}</span>
         <button type="button" aria-label={m.status!=="running"&&!done?`${locale==="kk"?"Қарсылас келмеді, жеңімпаз":"Неявка соперника, победитель"}: ${name(f.person)}`:undefined} className={done&&m.winner_id?(m.winner_id===f.id?"result-win":"result-loss"):"result-pick"} disabled={done||!!busy||!f.id||!m.participant_a_id||!m.participant_b_id||!["running","ready","scheduled"].includes(m.status)} onClick={()=>f.id&&void win(m,f.id)}>{done&&m.winner_id?(m.winner_id===f.id?L("Победил"):L("Проиграл")):m.status==="running"?L("Победа"):(locale==="kk"?"Келмеу":"Неявка")}</button>
       </div>)}</div>
       {done&&(m.scoreboard?.victory_method?m.scoreboard:boards[m.id])?.victory_method&&<p className="muted">{victoryLabel((m.scoreboard?.victory_method?m.scoreboard:boards[m.id])?.victory_method,locale==="kk")}{(m.scoreboard?.victory_method?m.scoreboard:boards[m.id])?.victory_method==="points"?` · ${(m.scoreboard?.victory_method?m.scoreboard:boards[m.id])?.score_a}:${(m.scoreboard?.victory_method?m.scoreboard:boards[m.id])?.score_b}`:""}</p>}
       {!done&&m.status==="running"&&<details><summary>{locale==="kk"?"Табло":"Табло"}</summary><MatchScoreboard matchId={m.id} tournamentId={tournamentId} matId={r.mat_id} names={[name(m.participantA),name(m.participantB)]} kk={locale==="kk"} seconds={m.round_seconds??timing.duration*60} rounds={m.round_count??1} rest={m.round_rest_seconds??0} onBoard={b=>setBoards(v=>({...v,[m.id]:b}))}/></details>}
       <div className="running-order"><button type="button" aria-label={`${L("Поднять бой ")}${r.scheduled_order}`} disabled={!!busy||done||m.status==="running"||!previous||["completed","running"].includes(previous.status)} onClick={()=>void move(i,-1)}>↑</button><button type="button" aria-label={`${L("Опустить бой ")}${r.scheduled_order}`} disabled={!!busy||done||m.status==="running"||!next||["completed","running"].includes(next.status)} onClick={()=>void move(i,1)}>↓</button></div>
     </article>})}
   <dialog ref={resultDialog} className="result-dialog" onCancel={e=>{if(busy)e.preventDefault();else setResult(null)}}>
    {result&&<><h2>{locale==="kk"?"Жеңісті растау":"Подтвердить победу"}</h2><p><strong>{name(result.winner===result.match.participant_a_id?result.match.participantA:result.match.participantB)}</strong></p>
    <label>{locale==="kk"?"Жеңіс тәсілі":"Способ победы"}<select className="field" value={method} disabled={!!busy} onChange={e=>setMethod(e.target.value)}>{victoryMethods.filter(row=>result.match.status==="running"||row[0]==="walkover").map(row=><option key={row[0]} value={row[0]}>{row[locale==="kk"?2:1]}</option>)}</select></label>
    {method==="points"&&<div className="form-grid"><label>{name(result.match.participantA)}<input className="field" type="number" min={0} max={999} step={1} value={scoreA} disabled={!!busy} onChange={e=>setScoreA(e.target.value)}/></label><label>{name(result.match.participantB)}<input className="field" type="number" min={0} max={999} step={1} value={scoreB} disabled={!!busy} onChange={e=>setScoreB(e.target.value)}/></label></div>}
    {message&&<p className="error" role="alert">{message}</p>}<div className="button-row"><button type="button" className="primary" disabled={!!busy} onClick={()=>void confirmResult()}>{locale==="kk"?"Жеңісті растау":"Подтвердить победу"}</button><button type="button" className="secondary" disabled={!!busy} onClick={()=>{resultDialog.current?.close();setResult(null)}}>{locale==="kk"?"Бас тарту":"Отмена"}</button></div></>}
   </dialog>
   <style jsx>{`
     .running-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.running-filters label{display:grid;gap:6px;min-width:0}.running-filters select{width:100%;min-width:0}
     .running-list{display:grid;gap:10px}.running-card{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.running-card-done{opacity:.5}
     .running-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.running-heading strong{font-size:17px}
     .running-meta{display:flex;gap:4px 12px;flex-wrap:wrap;color:var(--muted);font-size:14px;margin:8px 0 12px}
     .running-people{display:grid;gap:7px}.running-person{display:grid;grid-template-columns:minmax(0,1fr) 95px;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}
     .running-name{display:grid;gap:2px;min-width:0}.running-name strong{font-size:16px;line-height:1.3;overflow-wrap:break-word}.running-name small{color:var(--muted);font-size:13px}
     .running-person button{padding:9px 4px;font-size:13px;min-height:40px}.running-person .result-pick,.running-person .result-win,.running-person .result-loss{border-radius:10px;color:#fff;font-weight:800}.running-person .result-pick,.running-person .result-win{border:1px solid #21864d;background:#21864d}.running-person .result-loss{border:1px solid var(--accent);background:var(--accent)}.running-person .result-win,.running-person .result-loss{opacity:1;cursor:default}.running-order{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
     .running-order button{width:40px;height:40px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface-2);color:var(--text)}
     @media(max-width:600px){.running-filters{grid-template-columns:1fr}.running-card{padding:12px}.running-heading strong{font-size:16px}.running-person{grid-template-columns:minmax(0,1fr) 82px;gap:6px}.running-name strong{font-size:15px}}
   `}</style>
 </section>}</ActionScope>;
}

