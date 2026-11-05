import type {BracketDisplayMatch} from "./bracket-display";
// Derive elimination stages from advancement links, independent of stored round numbers.
export function bracketStage(match:BracketDisplayMatch,group:BracketDisplayMatch[],kk:boolean,roundRobin=false):string{
 if(roundRobin)return `${kk?"Кезең":"Тур"} ${match.round_number}`;
 const special=group.length<=3&&group.some(previous=>previous.round_number===1&&previous.loser_next_match_id&&group.some(row=>row.id===previous.loser_next_match_id));
 const incomingLoser=group.some(previous=>previous.loser_next_match_id===match.id);
 if(incomingLoser&&!special)return kk?"3-орын үшін":"За 3-е место";
 if(special){
  if(match.next_match_id===null&&match.loser_next_match_id===null)return kk?"Финал":"Финал";
  return incomingLoser?(kk?"Іріктеу кездесуі":"Отборочная встреча"):(kk?"Алдын ала кездесу":"Предварительная встреча");
 }
 const seen=new Set();
 let current=match,distance=0;
 while(current.next_match_id){
  if(seen.has(current.id))return `${kk?"Кезең":"Этап"} ${match.round_number}`;
  seen.add(current.id);
  const next=group.find(row=>row.id===current.next_match_id);
  if(!next)return `${kk?"Кезең":"Этап"} ${match.round_number}`;
  current=next;distance++;
 }
 if(current.loser_next_match_id)return `${kk?"Кезең":"Этап"} ${match.round_number}`;
 if(distance===0)return "Финал";
 if(distance===1)return kk?"Жартылай финал":"Полуфинал";
 return kk?`1/${2**distance} финал`:`1/${2**distance} финала`;
}
