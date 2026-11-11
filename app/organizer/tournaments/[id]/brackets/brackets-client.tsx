"use client";
import { availableDivisions, divisionNames } from "@/lib/tournament-divisions";
import LoadingIndicator from "@/components/loading-indicator";
import { useLiveReload } from "@/lib/use-live-refresh";
import { ActionScope, useActionFeedback } from "@/components/action-feedback";

import { useLocale } from "@/components/locale-provider";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import BracketView from "@/components/bracket-view";
import BracketShare from "@/components/bracket-share";
import BracketFilters,{emptyBracketFilter,filterCategories} from "@/components/bracket-filters";
import {projectSchedule,nextMatchIds,categoryDone,type BracketPerson,type BracketResult,type EventMatch} from "@/lib/event-brackets";
import { swappableAthletes } from "@/lib/bracket-swap";
import {isByeSeed,matchRole,pendingAthlete} from "@/lib/bracket-display";

type Category={round_seconds?:number|null;round_count?:number|null;round_rest_seconds?:number|null;id:string;name:string;division?:string;division_start_at?:string|null;bracket_format:string|null;age_min?:number|null;age_max?:number|null;weight_limit?:number|null};
type Person={id:string;first_name:string;last_name:string;club:string|null;city:string|null;coach:string|null};
type Match=EventMatch&{completed_at:string|null};
type ReadyCategory=Category&{count:number};

export default function BracketsClient({categories,tournamentId,defaultFormat,newFormats,isOwner,isPublic,tournamentName,timing}:{categories:Category[];tournamentId:string;defaultFormat:string;newFormats:boolean;isOwner:boolean;isPublic:boolean;tournamentName:string;timing:{duration:number;gap:number;rest:number}}){
 const [results,setResults]=useState<BracketResult[]>([]);
 const [division,setDivision]=useState("");
 const divisions=availableDivisions(categories.map(category=>category.division??""));
 const choices=categories.filter(category=>!division||category.division===division);
 const [filter,setFilter]=useState(emptyBracketFilter);
 const [now,setNow]=useState(()=>Date.now());
 const [published,setPublished]=useState<Set<string>>(new Set());
 const [unweighed,setUnweighed]=useState<{category_id:string;participant_id:string;name:string}[]>([]);
 const [warning,setWarning]=useState<string[]|null>(null);
 const divisionByCategory=new Map(categories.map(c=>[c.id,c.division??""]));
 const [rosterPeople,setRosterPeople]=useState<BracketPerson[]>([]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer)},[]);
 const [loading,setLoading]=useState(true);
 const [matches,setMatches]=useState<Match[]>([]);
 const [people,setPeople]=useState<Record<string,Person>>({});
 const [readyCats,setReadyCats]=useState<ReadyCategory[]>([]);
 const [rosterChanges,setRosterChanges]=useState<Record<string,{added:number;removed:number;names:string[]}>>({});
 const [selected,setSelected]=useState<Record<string,string[]>>({});
 const [formats,setFormats]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const kk = useLocale() === "kk";
 const s=useMemo(()=>createClient(),[]);
 const L=kk?{title:"Жекпе-жек торлары",form:"Торларды қалыптастыру",forming:"Қалыптастырылуда…",ready:"Қалыптастыруға дайын санаттар",noneReady:"Әзірге қалыптастыруға дайын санаттар жоқ.",empty:"Жекпе-жектер әлі қалыптастырылған жоқ.",fight:"Жекпе-жек",round:"Кезең",final:"Финал",third:"3-орын үшін",bye:"Бойсыз өтті (BYE)",share:"Тормен бөлісу",choose:"Орындарын ауыстыру үшін екі спортшыны таңдаңыз.",swap:"Орындарын ауыстыру",saved:"Спортшылардың орындары ауыстырылды.",locked:"Тек алғашқы жекпе-жегін бастамаған спортшылардың орындарын ауыстыруға болады.",status:{completed:"Аяқталды",running:"Өтіп жатыр",ready:"Дайын",scheduled:"Жоспарда"}}:{title:"Сетки",form:"Сформировать сетки",forming:"Формируем…",ready:"Готовые к формированию категории",noneReady:"Пока нет категорий, готовых к формированию сетки.",empty:"Бои ещё не сформированы.",fight:"Бой",round:"Раунд",final:"Финал",third:"За 3-е место",bye:"Прошёл без боя (BYE)",share:"Поделиться сеткой",choose:"Выберите двух спортсменов, чтобы поменять их местами.",swap:"Поменять местами",saved:"Спортсмены поменялись местами.",locked:"Можно менять местами только спортсменов, которые ещё не начали свой первый бой.",status:{completed:"Завершён",running:"Идёт",ready:"Готов",scheduled:"Запланирован"}};
 const personName=(p?:Person)=>p?`${p.last_name} ${p.first_name}`.trim():(kk?"Қатысушы күтілуде":"Ожидается участник");
 async function load(){try{
  const {data:m,error}=await s.from("matches").select("id,match_number,round_number,status,participant_a_id,participant_b_id,winner_id,completed_at,next_match_id,loser_next_match_id,category_id,started_at,match_scoreboards(score_a,score_b,victory_method)").eq("tournament_id",tournamentId).order("match_number");
  if(error){setMessage(error.message);return}
  const ids=[...new Set((m??[]).flatMap(x=>[x.participant_a_id,x.participant_b_id]).filter(Boolean) as string[])];
  const names:Record<string,Person>={};
  if(ids.length){const{data:p}=await s.from("participants").select("id,first_name,last_name,club,city,coach").in("id",ids);for(const person of p??[])names[person.id]=person}
  const {data:slots}=await s.from("match_schedule").select("match_id,mat_id,scheduled_order,approximate_time,mats(name),matches!inner(tournament_id)").eq("matches.tournament_id",tournamentId);
  const {data:brackets}=await s.from("brackets").select("category_id,published_at").in("category_id",categories.map(c=>c.id));
  setPublished(new Set((brackets??[]).filter(b=>b.published_at).map(b=>b.category_id)));
  const {data:places}=await s.from("results").select("category_id,participant_id,place").eq("tournament_id",tournamentId);setResults(places??[]);
  setMatches((m??[]).map(match=>{const slot=(slots??[]).find(x=>x.match_id===match.id);const sc=Array.isArray(match.match_scoreboards)?match.match_scoreboards[0]:match.match_scoreboards;return {...match,...(sc??{}),...(slot?{mat_id:slot.mat_id,scheduled_order:slot.scheduled_order,approximate_time:slot.approximate_time,mat_name:(Array.isArray(slot.mats)?slot.mats[0]:slot.mats)?.name}:{} )}}));setPeople(names);
  if(categories.length){
   const{data:cp}=await s.from("category_participants").select("category_id,participant_id,is_active,weigh_in_status").in("category_id",categories.map(c=>c.id));
   const pids=[...new Set((cp??[]).filter(x=>x.is_active).map(x=>x.participant_id))];
   const{data:rg}=pids.length?await s.from("registrations").select("participant_id,division,status,payment_status").eq("tournament_id",tournamentId).in("participant_id",pids):{data:[] as {participant_id:string;division:string;status:string;payment_status:string}[]};
   const paid=new Set((rg??[]).filter(x=>x.status==="confirmed"&&x.payment_status==="paid").map(x=>`${x.participant_id}:${x.division}`));
   const {data:allPeople}=pids.length?await s.from("participants").select("id,first_name,last_name,club,city,coach").in("id",pids):{data:[]};
   const allNames=new Map((allPeople??[]).map(p=>[p.id,p]));
   const confirmed=new Set((rg??[]).filter(r=>r.status==="confirmed").map(r=>`${r.participant_id}:${r.division}`));
   setUnweighed((cp??[]).filter(x=>x.is_active&&x.weigh_in_status!=="in_weight"&&confirmed.has(`${x.participant_id}:${divisionByCategory.get(x.category_id)}`)).map(x=>({...x,name:personName(allNames.get(x.participant_id))})));
   setRosterPeople((cp??[]).filter(x=>x.is_active).flatMap(x=>{const p=allNames.get(x.participant_id);return p?[{id:p.id,name:personName(p),club:p.club,city:p.city,coach:p.coach,category_id:x.category_id}]:[]}));
   const counts=new Map<string,number>();
   for(const x of cp??[])if(x.is_active&&x.weigh_in_status==="in_weight"&&paid.has(`${x.participant_id}:${divisionByCategory.get(x.category_id)}`))counts.set(x.category_id,(counts.get(x.category_id)??0)+1);
   const changes:Record<string,{added:number;removed:number;names:string[]}>={};
   for(const c of categories){
    const group=(m??[]).filter(x=>x.category_id===c.id);
    if(!group.length)continue;
    const eligible=new Set((cp??[]).filter(x=>x.category_id===c.id&&x.is_active&&x.weigh_in_status==="in_weight"&&paid.has(`${x.participant_id}:${divisionByCategory.get(x.category_id)}`)).map(x=>x.participant_id));
    const seeded=new Set(group.flatMap(x=>[x.participant_a_id,x.participant_b_id]).filter((id):id is string=>id!==null));
    const added=[...eligible].filter(id=>!seeded.has(id)).length;
    const removed=[...seeded].filter(id=>!eligible.has(id)).length;
    if(added||removed)changes[c.id]={added,removed,names:[...eligible].filter(id=>!seeded.has(id)).map(id=>personName(allNames.get(id)))};
   }
   setRosterChanges(changes);
   const formed=new Set((m??[]).map(x=>x.category_id));
   setReadyCats(categories.map(c=>({...c,count:counts.get(c.id)??0})).filter(c=>c.count>=2&&!formed.has(c.id)));
  }
 }catch{setMessage(kk?"Торларды жүктеу мүмкін болмады.":"Не удалось загрузить сетки.")}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 useLiveReload(()=>{if(!busy)return load()});
 const readyInDivision=readyCats.filter(c=>!division||c.division===division);
 const action = useActionFeedback(() => { setBusy(false); });
 async function formBrackets(without=false,categoryIds?:string[]){ return action.run(async () => {
  const target=categoryIds??readyInDivision.map(c=>c.id);
  if(!without&&unweighed.some(p=>target.includes(p.category_id))){setWarning(target);return;}
  setBusy(true);setMessage("");
  for(const categoryId of target){const{error}=await s.rpc("generate_checked_bracket",{p_category_id:categoryId,p_without_unweighed:without});if(error){setMessage(error.message);setBusy(false);await load();return}}
  await load();setBusy(false);
  }); }
 function selectAthlete(categoryId:string,id:string){
  const available=swappableAthletes(matches.filter(m=>m.category_id===categoryId));
  if(!available.has(id))return;
  setSelected(current=>{const ids=(current[categoryId]??[]).filter(x=>available.has(x));const next=ids.includes(id)?ids.filter(x=>x!==id):ids.length<2?[...ids,id]:[ids[0],id];return {...current,[categoryId]:next}});
 }
 async function swap(categoryId:string){ return action.run(async () => {
  const available=swappableAthletes(matches.filter(m=>m.category_id===categoryId));
  const ids=(selected[categoryId]??[]).filter(id=>available.has(id));if(ids.length!==2)return;
  setBusy(true);setMessage("");
  const{error}=await s.rpc("swap_bracket_participants",{p_category_id:categoryId,p_first_id:ids[0],p_second_id:ids[1]});
  if(error)setMessage(error.message);else{setSelected(current=>({...current,[categoryId]:[]}));await load();setMessage(L.saved)}
  setBusy(false);
  }); }
 async function refreshBracket(categoryId:string){ return action.run(async () => {
  const pending=unweighed.filter(p=>p.category_id===categoryId);
  if(pending.length&&!window.confirm((kk?"Салмағы расталмаған:\n":"Вес не подтверждён:\n")+pending.map(p=>p.name).join("\n")+(kk?"\nОларсыз қалыптастыру керек пе?":"\nСформировать без этих участников?")))return;
  if(!window.confirm(kk?"Осы санаттың торы мен жекпе-жек уақыты жаңартылады. Жалғастыру керек пе?":"Пары этой категории и время боёв обновятся. Продолжить?"))return;
  setBusy(true);setMessage("");
  const {error}=await s.rpc("refresh_unstarted_category_bracket",{p_category_id:categoryId});
  if(error)setMessage(error.message);
  else{setSelected(current=>({...current,[categoryId]:[]}));await load();setMessage(kk?"Санат торы жаңартылды.":"Сетка категории обновлена.")}
  setBusy(false);
  }); }
 async function changeFormat(categoryId:string,format:string){ return action.run(async () => {
  if(!window.confirm(kk?"Тор мен осы санаттың жекпе-жек уақыты қайта құрылады. Жалғастыру керек пе?":"Сетка и время боёв этой категории будут пересобраны. Продолжить?"))return;
  setBusy(true);setMessage("");
  const{error}=await s.rpc("set_category_bracket_format",{p_category_id:categoryId,p_format:format});
  if(error)setMessage(error.message);
  else{setFormats(current=>({...current,[categoryId]:format}));setSelected(current=>({...current,[categoryId]:[]}));await load()}
  setBusy(false);
  }); }
 async function publish(categoryId:string){return action.run(async()=>{setBusy(true);const {error}=await s.rpc("publish_category_bracket",{p_category_id:categoryId});if(error)setMessage(error.message);else await load();setBusy(false);});}
 const projected=projectSchedule(matches.map(m=>{const c=categories.find(c=>c.id===m.category_id);return {...m,division_start_at:c?.division_start_at,duration_seconds:c?.round_seconds!=null?c.round_seconds*(c.round_count??1)+(c.round_rest_seconds??0)*((c.round_count??1)-1):timing.duration*60}}),timing.duration,timing.gap,timing.rest,now);
 const next=nextMatchIds(projected);
 const visibleCats=filterCategories(choices,rosterPeople,filter);
 const formedCategories=visibleCats.filter(c=>matches.some(m=>m.category_id===c.id));
 const exportGroups=formedCategories.map(c=>({category:{...c,format:formats[c.id]??c.bracket_format??defaultFormat},matches:projected.filter(m=>m.category_id===c.id),results:results.filter(r=>r.category_id===c.id)}));

 return <ActionScope pending={action.pending} error={action.error} paused={false}>{loading?<LoadingIndicator />:<section className="brackets-workspace">
  {divisions.length>0&&<label>{kk?"Бөлім":"Раздел"}<select className="field" value={division} onChange={event=>{setDivision(event.target.value);setFilter(emptyBracketFilter);setWarning(null);}}><option value="">{kk?"Барлығы":"Все"}</option>{divisions.map(item=><option key={item} value={item}>{divisionNames[item]}</option>)}</select></label>}
  <div className="form-card"><div className="eyebrow">{L.title}</div><h2>{L.form}</h2><p className="muted">{L.ready}</p>{readyInDivision.length?<div style={{display:"grid",gap:8,marginBottom:12}}>{readyInDivision.map(c=><div key={c.id} style={{display:"flex",justifyContent:"space-between",gap:12}}><strong>{c.name}</strong><span className="muted">{c.count}{newFormats?` · ${(c.bracket_format??defaultFormat)==="round_robin"?(kk?"Айналмалы":"Круговая"):(kk?"Олимпиадалық":"Олимпийская")}`:""}</span></div>)}</div>:<p className="muted">{L.noneReady}</p>}<button type="button" className="primary" disabled={busy||!readyInDivision.length} onClick={()=>void formBrackets()}>{busy?L.forming:L.form}</button></div>
  {unweighed.length>0&&!warning&&<details className="form-card"><summary>{kk?"Салмағы расталмаған":"Вес не подтверждён"} · {unweighed.length}</summary><ul>{unweighed.map(p=><li key={`${p.category_id}-${p.participant_id}`}>{categories.find(c=>c.id===p.category_id)?.name}: {p.name}</li>)}</ul><a className="button-link" href={`/organizer/tournaments/${tournamentId}/weigh-in`}>{kk?"Салмақ өлшеуге өту":"Перейти к взвешиванию"}</a></details>}
  <BracketFilters categories={choices} people={rosterPeople} value={filter} onChange={setFilter} kk={kk}/>
  {warning&&<div className="form-card" role="alert"><h3>{kk?"Салмағы расталмаған қатысушылар":"Участники с неподтверждённым весом"}</h3><ul>{unweighed.filter(p=>warning.includes(p.category_id)).map(p=><li key={`${p.category_id}-${p.participant_id}`}>{categories.find(c=>c.id===p.category_id)?.name}: {p.name}</li>)}</ul><div className="button-row"><a className="button-link" href={`/organizer/tournaments/${tournamentId}/weigh-in`}>{kk?"Салмақ өлшеуге өту":"Перейти к взвешиванию"}</a><button type="button" className="secondary" disabled={busy} onClick={()=>{const ids=warning;setWarning(null);void formBrackets(true,ids)}}>{kk?"Оларсыз қалыптастыру":"Сформировать без этих участников"}</button><button type="button" onClick={()=>setWarning(null)}>{kk?"Бас тарту":"Отмена"}</button></div></div>}
  {message&&<p className="error" role="status">{message}</p>}
  <div className="category-list">{formedCategories.map(category=>{
   const group=projected.filter(m=>m.category_id===category.id).sort((a,b)=>a.round_number-b.round_number||a.match_number-b.match_number);
   const roundRobin=newFormats&&(formats[category.id]??category.bracket_format??defaultFormat)==="round_robin";
   const locked=group.some(m=>m.winner_id||!(["scheduled","ready"].includes(m.status)));
   const rosterChange=rosterChanges[category.id];
   const available=roundRobin?new Set<string>():swappableAthletes(group);
   const picked=(selected[category.id]??[]).filter(id=>available.has(id));
   const name=(id:string|null)=>id?personName(people[id]):"";
   return <section key={category.id} className="form-card bracket-category-card"><div className="bracket-category-heading"><h2>{category.name}</h2><div className="bracket-category-actions">{categoryDone(group)&&<span className="status-pill">{kk?"Аяқталды":"Завершено"}</span>}<BracketShare title={tournamentName} groups={[{category:{...category,format:roundRobin?"round_robin":"single_elimination"},matches:group,results:categoryDone(group)?results.filter(r=>r.category_id===category.id):[]}]} people={rosterPeople} url={`/tournaments/${tournamentId}/brackets/${category.id}`} kk={kk}/></div></div><details>
    <summary style={{cursor:"pointer",fontWeight:800,fontSize:14}}>{kk?"Торды ашу":"Открыть сетку"} · {group.length} {kk?"жекпе-жек":"боёв"}{roundRobin?` · ${kk?"Айналмалы":"Круговая"}`:""}{rosterChange&&<span className="status-pill" style={{marginLeft:8,fontSize:12}}>{rosterChange.added?(kk?"Жаңа қатысушы":"Новый участник"):(kk?"Құрам өзгерді":"Состав изменился")}</span>}</summary>
    {isOwner&&newFormats&&<label style={{display:"block",marginTop:12}}>{kk?"Тор форматы":"Формат сетки"}
     <select className="field" value={formats[category.id]??category.bracket_format??defaultFormat} disabled={busy||locked} onChange={e=>void changeFormat(category.id,e.target.value)}>
      <option value="single_elimination">{kk?"Олимпиадалық":"Олимпийская"}</option><option value="round_robin">{kk?"Айналмалы":"Круговая"}</option>
     </select></label>}
    {rosterChange?.names.length>0&&<p className="muted">{rosterChange.names.join(", ")}</p>}{rosterChange&&<div style={{marginTop:12,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><span className="muted">{kk?`Жаңа: ${rosterChange.added} · шығарылған: ${rosterChange.removed}`:`Новых: ${rosterChange.added} · выбывших: ${rosterChange.removed}`}</span>{isOwner&&!locked?<button type="button" className="primary" disabled={busy} onClick={()=>void refreshBracket(category.id)}>{kk?"Торды жаңарту":"Обновить сетку"}</button>:<span className="muted">{kk?"Жекпе-жектер басталған соң торды жаңарту мүмкін емес.":"После начала боёв сетку обновить нельзя."}</span>}</div>}
    {isOwner&&isPublic&&<button type="button" className="secondary" disabled={busy||published.has(category.id)} onClick={()=>void publish(category.id)}>{published.has(category.id)?(kk?"Жарияланды":"Опубликовано"):(kk?"Торды жариялау":"Опубликовать сетку")}</button>}
    {isOwner&&available.size>=2&&!roundRobin&&<p className="muted">{L.choose}</p>}{isOwner&&locked&&!roundRobin&&<p className="muted">{L.locked}</p>}
    <BracketView matches={group} people={rosterPeople} kk={kk} roundRobin={roundRobin} nextIds={next} results={results.filter(r=>r.category_id===category.id)}/>
    {isOwner&&!roundRobin&&available.size>=2&&<div className="button-row">{[...available].map(id=><button key={id} type="button" className={picked.includes(id)?"primary":"secondary"} disabled={busy} aria-pressed={picked.includes(id)} onClick={()=>selectAthlete(category.id,id)}>{name(id)}</button>)}</div>}
    {isOwner&&available.size>=2&&!roundRobin&&<button type="button" className="primary" style={{marginTop:12}} disabled={busy||picked.length!==2} onClick={()=>void swap(category.id)}>{L.swap}</button>}
   </details></section>})}</div>{exportGroups.length>0&&<BracketShare title={tournamentName} groups={exportGroups} people={rosterPeople} url={`/tournaments/${tournamentId}/brackets`} kk={kk} all/>}{formedCategories.length===0&&<div className="empty-state">{L.empty}</div>}
 </section>}</ActionScope>;
}

