export type BracketDisplayMatch={
 id:string;
 match_number:number;
 round_number:number;
 next_match_id:string|null;
 loser_next_match_id:string|null;
 winner_id?:string|null;
 has_winner?:boolean;
 participant_a_id?:string|null;
 participant_b_id?:string|null;
 participant_a_is_bye?:boolean;
 participant_b_is_bye?:boolean;
};

export function matchRole(match:BracketDisplayMatch,group:BracketDisplayMatch[]):"final"|"third"|"normal"{
 if(group.some(previous=>previous.loser_next_match_id===match.id))return "third";
 return match.next_match_id===null&&match.loser_next_match_id===null?"final":"normal";
}

export function pendingAthlete(match:BracketDisplayMatch,side:"a"|"b",group:BracketDisplayMatch[],kk:boolean):string{
 const kind=matchRole(match,group)==="third"?"loser":"winner";
 const sources=group.filter(previous=>(kind==="loser"?previous.loser_next_match_id:previous.next_match_id)===match.id);
 const pending=sources.filter(previous=>!(previous.has_winner||previous.winner_id)).sort((a,b)=>a.match_number-b.match_number);
 if(!pending.length)return kk?"Қатысушы күтілуде":"Ожидается участник";
 const emptyBoth=(match as BracketDisplayMatch&{participant_a_id?:string|null;participant_b_id?:string|null;participant_a_name?:string|null;participant_b_name?:string|null});
 const aEmpty=!(emptyBoth.participant_a_id??emptyBoth.participant_a_name);
 const bEmpty=!(emptyBoth.participant_b_id??emptyBoth.participant_b_name);
 const source=aEmpty&&bEmpty&&pending.length>1?pending[side==="a"?0:1]:pending[0];
 const word=kind==="loser"?(kk?"жеңілген":"проигравший"):(kk?"жеңімпазы":"победитель");
 return kk?`#${source.match_number} жекпе-жектің ${word}`:`${word} боя #${source.match_number}`;
}

export function isByeSeed(match:BracketDisplayMatch,side:"a"|"b",group:BracketDisplayMatch[]):boolean{
 const explicit=side==="a"?match.participant_a_is_bye:match.participant_b_is_bye;
 if(explicit!==undefined)return explicit;
 const id=side==="a"?match.participant_a_id:match.participant_b_id;
 return !!id&&match.round_number>1&&!group.some(previous=>previous.round_number<match.round_number&&
   (previous.participant_a_id===id||previous.participant_b_id===id));
}
