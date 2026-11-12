import type { BracketDisplayMatch } from "./bracket-display";
export type BracketPerson={id:string;name:string;club?:string|null;city?:string|null;coach?:string|null;age?:number|null;weight?:number|null;status?:string;category_id?:string|null};
export type EventMatch=BracketDisplayMatch & {category_id:string;division_start_at?:string|null;duration_seconds?:number|null;victory_method?:string|null;score_a?:number|null;score_b?:number|null;status:string;winner_id:string|null;participant_a_id:string|null;participant_b_id:string|null;started_at?:string|null;completed_at?:string|null;mat_id?:string|null;mat_name?:string|null;scheduled_order?:number|null;approximate_time?:string|null};
export type EventCategory={id:string;name:string;division?:string;age_min?:number|null;age_max?:number|null;weight_limit?:number|null;format?:string|null;published?:boolean};
type CategoryOrderFields=Pick<EventCategory,"name"|"age_min"|"age_max"|"weight_limit">&{weight_min?:number|null};

function categoryWeightFloor(category:CategoryOrderFields){
 if(category.weight_min!=null)return category.weight_min;
 // The public event payload omits weight_min. Open-ended categories include it in their label.
 const weight=category.name.match(/(\d+(?:[.,]\d+)?)\s*\+\s*кг|(?:свыше|от)\s+(\d+(?:[.,]\d+)?)\s*кг/iu);
 return weight?Number((weight[1]??weight[2]).replace(",",".")):undefined;
}

export function compareBracketCategories(a:CategoryOrderFields,b:CategoryOrderFields){
 const last=Number.POSITIVE_INFINITY;
 const minA=categoryWeightFloor(a),minB=categoryWeightFloor(b);
 return (a.age_min??last)-(b.age_min??last)
  ||(a.age_max??last)-(b.age_max??last)
  ||(a.weight_limit??minA??last)-(b.weight_limit??minB??last)
  ||Number(a.weight_limit==null)-Number(b.weight_limit==null);
}

export type BracketResult={category_id:string;participant_id:string;place:number};
export type EventData={results:BracketResult[];categories:EventCategory[];participants:BracketPerson[];matches:EventMatch[];bout_minutes:number;bout_interval_minutes:number;athlete_rest_minutes:number};
export const categoryDone=(matches:EventMatch[])=>matches.length>0&&matches.every(m=>["completed","cancelled"].includes(m.status));
export function projectSchedule<T extends EventMatch>(matches:T[],duration=5,gap=0,rest=5,now=Date.now()):T[]{
 const active=matches.some(m=>m.started_at||m.completed_at||(m.approximate_time&&new Date(m.approximate_time).getTime()<now));
 if(!active)return matches;
 const result=matches.map(m=>({...m}));
 const stamp=(value?:string|null)=>value?new Date(value).getTime():0;
 const end=(m:EventMatch)=>m.status==="completed"?stamp(m.completed_at):m.status==="running"?Math.max(stamp(m.started_at)+(m.duration_seconds??duration*60)*1000,now):stamp(m.approximate_time)+(m.duration_seconds??duration*60)*1000;
 const position=(a:EventMatch,b:EventMatch)=>(
   (a.division_start_at||b.division_start_at ? stamp(a.division_start_at)-stamp(b.division_start_at) : 0)
   || (a.scheduled_order??Infinity)-(b.scheduled_order??Infinity)
 );
 const queue=result.filter(m=>m.status!=="completed"&&m.status!=="cancelled").sort(position);
 for(const m of queue)if(m.status!=="running"&&m.approximate_time)m.approximate_time=new Date(Math.max(now,stamp(m.approximate_time))).toISOString();
 for(let pass=0;pass<=queue.length;pass++){
  let changed=false;
  for(const m of queue){
   if(m.status==="running"||!m.approximate_time||!m.mat_id)continue;
   let start=stamp(m.approximate_time);
   for(const previous of result){
    if(previous.id===m.id||previous.status==="cancelled")continue;
    const earlier=previous.status==="completed"||previous.status==="running"||position(previous,m)<0;
    const sameMat=earlier&&previous.mat_id===m.mat_id;
    const feeder=previous.next_match_id===m.id||previous.loser_next_match_id===m.id;
    const athlete=earlier&&[m.participant_a_id,m.participant_b_id].some(id=>id&&(id===previous.participant_a_id||id===previous.participant_b_id));
    if(sameMat||feeder||athlete)start=Math.max(start,end(previous)+Math.max(sameMat?gap:0,feeder||athlete?rest:0)*60000);
   }
   if(start>stamp(m.approximate_time)){m.approximate_time=new Date(start).toISOString();changed=true;}
  }
  if(!changed)break;
 }
 return result;
}
export function nextMatchIds(matches:EventMatch[]):Set<string>{
 const next=new Map<string,EventMatch>();
 for(const m of [...matches].sort((a,b)=>(Date.parse(a.division_start_at??"")-Date.parse(b.division_start_at??"")||0)||(a.scheduled_order??Infinity)-(b.scheduled_order??Infinity))){
  if(!m.mat_id||m.status==="completed"||m.status==="cancelled")continue;
  if(m.status==="running"){next.set(m.mat_id,m);continue;}
  if(!next.has(m.mat_id)&&m.participant_a_id&&m.participant_b_id)next.set(m.mat_id,m);
 }
 return new Set([...next.values()].filter(m=>m.status!=="running").map(m=>m.id));
}
export type BracketBox={match:EventMatch;x:number;y:number};
export function bracketLayout(matches:EventMatch[]):{boxes:BracketBox[];width:number;height:number;links:{from:BracketBox;to:BracketBox;loser:boolean}[]}{
 const rounds=[...new Set(matches.map(m=>m.round_number))].sort((a,b)=>a-b);
 const boxes:BracketBox[]=[];let row=0;const positioned=new Map<string,BracketBox>();
 const incoming=(m:EventMatch)=>matches.filter(p=>p.next_match_id===m.id);
 function place(m:EventMatch):BracketBox{
  const found=positioned.get(m.id);if(found)return found;
  const parents=incoming(m).map(place);
  const loserParents=matches.filter(p=>p.loser_next_match_id===m.id).map(place);
  let y:number;
  if(parents.length===2)y=(parents[0].y+parents[1].y)/2;
  else if(parents.length===1){y=(parents[0].y+row*126)/2;row++;}
  else {y=row*126;row++;}
  const box={match:m,x:Math.max(-300,...parents.map(p=>p.x),...loserParents.map(p=>p.x))+300,y};positioned.set(m.id,box);boxes.push(box);return box;
 }
 const roots=matches.filter(m=>!m.next_match_id&&!matches.some(p=>p.loser_next_match_id===m.id));
 roots.forEach(place);matches.forEach(m=>{if(!positioned.has(m.id))place(m)});
 return {boxes,width:Math.max(300,...boxes.map(b=>b.x+300)),height:Math.max(126,...boxes.map(b=>b.y+126)),links:boxes.flatMap(from=>[from.match.next_match_id,from.match.loser_next_match_id].flatMap((id,index)=>{const to=id?positioned.get(id):null;return to?[{from,to,loser:index===1}]:[]}))};
}
