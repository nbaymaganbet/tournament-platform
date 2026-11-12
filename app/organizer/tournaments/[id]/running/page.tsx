import { availableDivisions, categoryLabel } from "@/lib/tournament-divisions";
import { uiText } from "@/lib/ui-text";
import { getLocale } from "@/lib/i18n-server";
import Link from "@/components/pending-link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import RunningClient from "./running-client";
import {hasTournamentPermission,permissionDeniedPage} from "@/lib/tournament-permissions";

export default async function RunningPage({params}:{params:Promise<{id:string}>}){
 const locale = await getLocale();const L = (text: string) => uiText(locale, text);

 const{id}=await params,s=await createClient();
 const{data:{user}}=await s.auth.getUser();if(!user)return null;
 if(!(await hasTournamentPermission(s,id,"running")))return permissionDeniedPage();
 const{data:o}=await s.from("organizers").select("id").eq("user_id",user.id).maybeSingle();
 const{data:t}=await s.from("tournaments").select("id,name,organizer_id,divisions,victory_methods,date,schedule_start_time,gi_start_at,no_gi_start_at,bout_minutes,bout_interval_minutes,athlete_rest_minutes").eq("id",id).single();if(!t)notFound();
 const{data:member}=await s.from("tournament_members").select("role").eq("tournament_id",id).eq("user_id",user.id).maybeSingle();
 if(o?.id!==t.organizer_id&&!member)notFound();
 const [{data:matches},{data:schedule},{data:categories},{data:mats},{data:brackets}]=await Promise.all([
   s.from("matches").select("id,match_number,round_number,status,participant_a_id,participant_b_id,category_id,winner_id,next_match_id,loser_next_match_id,started_at,completed_at,match_scoreboards(*),participants_a:participants!matches_participant_a_id_fkey(first_name,last_name,club),participants_b:participants!matches_participant_b_id_fkey(first_name,last_name,club)").eq("tournament_id",id),
   s.from("match_schedule").select("id,match_id,scheduled_order,approximate_time,mat_id,matches!inner(tournament_id)").eq("matches.tournament_id",id).order("scheduled_order"),
   s.from("categories").select("id,name,age_group_name,division,round_seconds,round_count,round_rest_seconds").eq("tournament_id",id),
   s.from("mats").select("id,name").eq("tournament_id",id),
   s.from("brackets").select("category_id,format,categories!inner(tournament_id)").eq("categories.tournament_id",id)
 ]);
 const categoryNames=Object.fromEntries((categories??[]).map(c=>[c.id,categoryLabel([c.age_group_name,c.name].filter(Boolean).join(" · "),c.division)]));
 const zoneNames=Object.fromEntries((mats??[]).map(m=>[m.id,m.name]));
 return <main className="container dashboard-page">
   <div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {t.name}</Link></div>
   <div className="section-header"><div><div className="eyebrow">LIVE</div><h1>{L("Проведение")}</h1><p className="muted">{L("Очередь поединков и фиксация победителей.")}</p></div></div>
   <RunningClient tournamentId={id} initialMatches={(matches??[]).map((m:any)=>({...m,...(()=>{const c=(categories??[]).find(c=>c.id===m.category_id);const defaultStart=t.date&&t.schedule_start_time?`${t.date}T${t.schedule_start_time}+05:00`:null;return{division_start_at:t.divisions?.length?(c?.division==="gi"?t.gi_start_at:c?.division==="no_gi"?t.no_gi_start_at:defaultStart)??defaultStart:null,round_seconds:c?.round_seconds??t.bout_minutes*60,round_count:c?.round_count??1,round_rest_seconds:c?.round_rest_seconds??0,duration_seconds:c?.round_seconds!=null?c.round_seconds*(c.round_count??1)+(c.round_rest_seconds??0)*((c.round_count??1)-1):t.bout_minutes*60,scoreboard:Array.isArray(m.match_scoreboards)?m.match_scoreboards[0]:m.match_scoreboards}})(),participantA:Array.isArray(m.participants_a)?m.participants_a[0]:m.participants_a,participantB:Array.isArray(m.participants_b)?m.participants_b[0]:m.participants_b}))}
     initialSchedule={(schedule??[]).map(r=>({id:r.id,match_id:r.match_id,scheduled_order:r.scheduled_order,approximate_time:r.approximate_time,mat_id:r.mat_id}))}
     divisions={availableDivisions(t.divisions)} categoryDivisions={Object.fromEntries((categories??[]).map(c=>[c.id,c.division]))} allowedMethods={t.victory_methods} categoryNames={categoryNames} categoryFormats={Object.fromEntries((brackets??[]).map(b=>[b.category_id,b.format]))} zoneNames={zoneNames} timing={{duration:t.bout_minutes,gap:t.bout_interval_minutes,rest:t.athlete_rest_minutes}}/>
 </main>;
}

