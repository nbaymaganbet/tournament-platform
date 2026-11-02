"use client";
import {useEffect,useState} from "react";
import Link from "@/components/pending-link";
import BracketFilters,{emptyBracketFilter,filterCategories} from "./bracket-filters";
import BracketView from "./bracket-view";
import BracketShare from "./bracket-share";
import {categoryDone,projectSchedule,nextMatchIds,type EventData} from "@/lib/event-brackets";
export default function PublicEventList({id,title,data,kk,mode,categoryId}:{id:string;title:string;data:EventData;kk:boolean;mode:"participants"|"brackets";categoryId?:string}){
 const [filter,setFilter]=useState(emptyBracketFilter),[pending,setPending]=useState<Record<string,boolean>>({}),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer)},[]);
 const matches=projectSchedule(data.matches,data.bout_minutes,data.bout_interval_minutes,data.athlete_rest_minutes,now);
 const next=nextMatchIds(matches);
 const categories=filterCategories(data.categories,data.participants,filter).filter(c=>!categoryId||c.id===categoryId);
 const formed=categories.filter(c=>c.published&&matches.some(m=>m.category_id===c.id));
 const group=(id:string)=>matches.filter(m=>m.category_id===id);
 const results=(id:string)=>(data.results??[]).filter(r=>r.category_id===id);
 return <>
  {!categoryId&&<BracketFilters categories={data.categories} people={data.participants} kk={kk} value={filter} onChange={setFilter}/>}
  {mode==="participants"?categories.map(c=>{const people=data.participants.filter(p=>p.category_id===c.id),confirmed=people.filter(p=>p.status==="confirmed"),unconfirmed=people.filter(p=>p.status!=="confirmed");return <section key={c.id} className="form-card"><h2>{c.name} · {confirmed.length}</h2>{[...confirmed,...(pending[c.id]?unconfirmed:[])].map(p=><article key={p.id} className="participant-card"><div className="participant-main"><strong>{p.name}</strong><small>{[p.club,p.city].filter(Boolean).join(" · ")}</small></div><span className="status-pill">{p.status==="confirmed"?(kk?"Расталған":"Подтверждён"):(kk?"Растау күтілуде":"Ожидает подтверждения")}</span></article>)}{unconfirmed.length>0&&<button type="button" className="secondary" onClick={()=>setPending(v=>({...v,[c.id]:!v[c.id]}))}>{pending[c.id]?(kk?"Расталмағандарды жасыру":"Скрыть неподтверждённых"):(kk?"Расталмағандарды көрсету":"Показать неподтверждённых")} · {unconfirmed.length}</button>}</section>}):<>
   {!formed.length&&<div className="empty-state">{kk?"Торлар әлі дайын емес. Қалыптастырылуын күтіңіз.":"Сетки ещё не готовы. Ожидайте формирования."}</div>}
   {formed.map(c=><section className="form-card" key={c.id}><div className="bracket-category-heading"><h2>{c.name}</h2><div className="button-row">{categoryDone(group(c.id))&&<span className="status-pill">{kk?"Аяқталды":"Завершено"}</span>}<BracketShare title={title} groups={[{category:c,matches:group(c.id),results:results(c.id)}]} people={data.participants} url={`/tournaments/${id}/brackets/${c.id}`} kk={kk}/></div></div>{categoryId?<BracketView matches={group(c.id)} people={data.participants} kk={kk} roundRobin={c.format==="round_robin"} nextIds={next} results={results(c.id)}/>:<Link className="button-link" href={`/tournaments/${id}/brackets/${c.id}`}>{kk?"Торды ашу":"Открыть сетку"}</Link>}</section>)}
   {!categoryId&&formed.length>0&&<BracketShare title={title} groups={formed.map(c=>({category:c,matches:group(c.id),results:results(c.id)}))} people={data.participants} url={`/tournaments/${id}/brackets`} kk={kk} all/>}
  </>}
 </>;
}
