"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {useLiveRefresh} from "@/lib/use-live-refresh";
import {clockText,remainingMilliseconds,type Scoreboard} from "@/lib/scoreboard";
export default function MatchScoreboard({matchId,tournamentId,matId,names,kk,seconds,rounds,rest,onBoard}:{matchId:string;tournamentId:string;matId:string|null;names:[string,string];kk:boolean;seconds:number;rounds:number;rest:number;onBoard:(b:Scoreboard)=>void}){
 const[board,setBoard]=useState<Scoreboard>({match_id:matchId,score_a:0,score_b:0,current_round:1,round_seconds:seconds,round_count:rounds,rest_seconds:rest,remaining_ms:seconds*1000,timer_started_at:null,is_rest:false,victory_method:null,version:0});
 const[now,setNow]=useState(Date.now()),[offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
 function accept(b:Scoreboard){if(b.server_now)setOffset(Date.parse(b.server_now)-Date.now());setBoard(b);onBoard(b)}
 async function refresh(){const{data,error}=await createClient().from("match_scoreboards").select("*").eq("match_id",matchId).maybeSingle();if(error)throw error;if(data)accept(data)}
 useEffect(()=>{void refresh().catch(()=>setError(kk?"Табло жүктелмеді":"Не удалось загрузить табло"));const timer=setInterval(()=>setNow(Date.now()),200);return()=>clearInterval(timer)},[matchId]);
 useLiveRefresh(tournamentId,"match_scoreboards",refresh,false,10000);
 async function update(action:string,value:number|null=null,side:string|null=null){setBusy(true);setError("");try{const{data,error}=await createClient().rpc("update_match_scoreboard",{p_match_id:matchId,p_action:action,p_value:value,p_side:side,p_version:board.version});if(error)throw error;accept(data)}catch(error){setError((error as {message?:string}).message??String(error));await refresh().catch(()=>{})}finally{setBusy(false)}}
 return <div className="match-score-controls" data-live-paused={busy?"true":undefined}>
 <p><strong>{board.is_rest?(kk?"Демалыс":"Отдых"):(kk?"Раунд":"Раунд")} {board.current_round}/{board.round_count}</strong></p>
 <div className="score-timer" aria-live="off">{clockText(remainingMilliseconds(board,now+offset))}</div>
 <div className="button-row"><button type="button" className="secondary" disabled={busy||remainingMilliseconds(board,now+offset)===0} onClick={()=>void update(board.timer_started_at?"pause":"start")}>{board.timer_started_at?(kk?"Үзіліс":"Пауза"):(kk?"Таймерді қосу":"Запустить таймер")}</button>
 {board.current_round<board.round_count&&<><button type="button" className="secondary" disabled={busy||board.is_rest||!board.rest_seconds} onClick={()=>void update("rest")}>{kk?"Демалыс":"Отдых"}</button><button type="button" className="secondary" disabled={busy} onClick={()=>void update("round")}>{kk?"Келесі раунд":"Следующий раунд"}</button></>}</div>
 <div className="score-control-grid">{(["a","b"] as const).map((side,i)=><div key={side} className={i?"score-blue":"score-red"}><strong>{names[i]}</strong><div className="score-number">{board[side==="a"?"score_a":"score_b"]}</div><div className="button-row"><button type="button" className="secondary" aria-label={`${names[i]}: −1`} disabled={busy||board[side==="a"?"score_a":"score_b"]===0} onClick={()=>void update("score",board[side==="a"?"score_a":"score_b"]-1,side)}>−1</button><button type="button" className="secondary" aria-label={`${names[i]}: +1`} disabled={busy||board[side==="a"?"score_a":"score_b"]===999} onClick={()=>void update("score",board[side==="a"?"score_a":"score_b"]+1,side)}>+1</button></div></div>)}</div>
 {matId&&<a className="button-link secondary" href={`/scoreboard/${matId}`} target="_blank" rel="noreferrer">{kk?"Экрандағы таблоны ашу ↗":"Открыть табло для экрана ↗"}</a>}{error&&<p className="error" role="alert">{error}</p>}
 </div>;
}
