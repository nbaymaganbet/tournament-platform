"use client";
import {victoryLabel} from "@/lib/scoreboard";
import {useEffect,useState} from "react";
import {bracketLayout,nextMatchIds,type BracketPerson,type BracketResult,type EventMatch} from "@/lib/event-brackets";
import {isByeSeed,matchRole,pendingAthlete} from "@/lib/bracket-display";
import {bracketStage} from "@/lib/bracket-stage";
export default function BracketView({matches,people,kk,roundRobin=false,nextIds,results=[]}:{matches:EventMatch[];people:BracketPerson[];kk:boolean;roundRobin?:boolean;nextIds?:Set<string>;results?:BracketResult[]}){
 const [diagram,setDiagram]=useState(false);
 const names=new Map(people.map(p=>[p.id,p]));
 const next=nextIds??nextMatchIds(matches);
 const person=(m:EventMatch,side:"a"|"b")=>{const id=side==="a"?m.participant_a_id:m.participant_b_id;const p=id?names.get(id):null;return {id,p,name:p?.name??pendingAthlete(m,side,matches,kk)}};
 const status=(m:EventMatch)=>m.status==="completed"?(kk?"Аяқталды":"Завершён"):m.status==="running"?(kk?"Өтіп жатыр":"Идёт"):next.has(m.id)?(kk?"Келесі":"Следующий"):m.approximate_time?`≈ ${new Date(m.approximate_time).toLocaleString(kk?"kk-KZ":"ru-RU",{...(m.division_start_at?{day:"2-digit",month:"2-digit"} as const:{}),hour:"2-digit",minute:"2-digit",timeZone:"Asia/Almaty"})}`:(kk?"Уақыт тағайындалмаған":"Время не назначено");
 const stage=(m:EventMatch)=>bracketStage(m,matches,kk,roundRobin);
 const layout=bracketLayout(matches);
 const columns=new Map(layout.boxes.map(box=>[box.match.id,box.x]));
 const ordered=[...matches].sort((a,b)=>roundRobin?a.round_number-b.round_number||a.match_number-b.match_number:
  Number(matchRole(a,matches)==="third")-Number(matchRole(b,matches)==="third")||(columns.get(a.id)??0)-(columns.get(b.id)??0)||a.match_number-b.match_number);
 const stages=new Map<string,EventMatch[]>();
 for(const match of ordered){const label=stage(match);const group=stages.get(label)??[];group.push(match);stages.set(label,group);}
 return <div className="bracket-view">
  {[...stages].map(([label,group])=><section key={label}><h3>{label}</h3>{group.map(m=><article key={m.id} className="bracket-bout">
   <div className="bracket-bout-heading"><strong>#{m.match_number} · {stage(m)}</strong><span className="status-pill">{status(m)}</span></div>
   {(["a","b"] as const).map(side=>{const {id,p,name}=person(m,side);return <div className={id&&m.winner_id===id?"bracket-winner":""} key={side}><strong>{name}</strong>{p&&<small>{[p.club,p.city].filter(Boolean).join(" · ")}</small>}{!roundRobin&&isByeSeed(m,side,matches)&&<small>{kk?"Бойсыз өтті (BYE)":"Прошёл без боя (BYE)"}</small>}</div>})}
   {m.mat_name&&<small className="muted">{m.mat_name}</small>}{m.status==="completed"&&m.victory_method&&<small className="muted">{victoryLabel(m.victory_method,kk)}{m.victory_method==="points"?` · ${m.score_a}:${m.score_b}`:""}</small>}
  </article>)}</section>)}
  {roundRobin?<div className="bracket-scroll"><table><thead><tr><th>{kk?"Спортшы":"Спортсмен"}</th><th>{kk?"Жеңістер":"Победы"}</th><th>{kk?"Орын":"Место"}</th></tr></thead><tbody>{[...new Set(matches.flatMap(m=>[m.participant_a_id,m.participant_b_id]).filter((id):id is string=>!!id))].map(id=>({id,wins:matches.filter(m=>m.winner_id===id).length})).sort((a,b)=>b.wins-a.wins).map(row=><tr key={row.id}><td>{names.get(row.id)?.name}</td><td>{row.wins}</td><td>{results.find(r=>r.participant_id===row.id)?.place??"—"}</td></tr>)}</tbody></table></div>:<>
   <button type="button" className="secondary" onClick={()=>setDiagram(v=>!v)}>{diagram?(kk?"Торды жасыру":"Скрыть сетку"):(kk?"Торды көрсету":"Показать сетку")}</button>
   {diagram&&<div className="bracket-scroll"><svg role="img" aria-label={kk?"Жекпе-жек торы":"Схема сетки"} viewBox={`0 0 ${layout.width} ${layout.height}`} style={{width:layout.width,minWidth:layout.width,height:layout.height}}>
    {layout.links.map(({from,to,loser})=><path key={`${from.match.id}-${to.match.id}`} d={`M${from.x+266},${from.y+48} H${from.x+282} V${to.y+48} H${to.x+8}`} fill="none" stroke="currentColor" opacity=".45" strokeDasharray={loser?"4 4":undefined}/>)}
    {layout.boxes.map(({match:m,x,y})=><g key={m.id} transform={`translate(${x+8},${y+8})`}><rect width="258" height="98" rx="6" fill="var(--surface)" stroke="var(--line-strong)"/><text x="8" y="17" fill="var(--muted)" fontSize="11">#{m.match_number} · {stage(m)} · {status(m)}</text>{(["a","b"] as const).map((side,i)=>{const p=person(m,side);return <g key={side}><text x="8" y={37+i*30} fontSize="12" fill={p.id&&p.id===m.winner_id?"#39b878":"var(--text)"}>{p.name.length>31?p.name.slice(0,30)+"…":p.name}</text><text x="8" y={49+i*30} fontSize="9" fill="var(--muted)">{[p.p?.club,p.p?.city].filter(Boolean).join(" · ").slice(0,43)}</text></g>})}</g>)}
   </svg></div>}
  </>}
 </div>;
}
