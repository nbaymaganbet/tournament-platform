import Link from "next/link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import RunningClient from "./running-client";
import {hasTournamentPermission,permissionDeniedPage} from "@/lib/tournament-permissions";

export default async function RunningPage({params}:{params:Promise<{id:string}>}){
 const{id}=await params,s=await createClient();
 const{data:{user}}=await s.auth.getUser();if(!user)return null;
 if(!(await hasTournamentPermission(s,id,"running")))return permissionDeniedPage();
 const{data:o}=await s.from("organizers").select("id").eq("user_id",user.id).maybeSingle();
 const{data:t}=await s.from("tournaments").select("id,name,organizer_id").eq("id",id).single();if(!t)notFound();
 const{data:member}=await s.from("tournament_members").select("role").eq("tournament_id",id).eq("user_id",user.id).maybeSingle();
 if(o?.id!==t.organizer_id&&!member)notFound();
 const [{data:matches},{data:schedule},{data:categories},{data:mats}]=await Promise.all([
   s.from("matches").select("id,match_number,round_number,status,participant_a_id,participant_b_id,category_id,winner_id,participants_a:participants!matches_participant_a_id_fkey(first_name,last_name,club),participants_b:participants!matches_participant_b_id_fkey(first_name,last_name,club)").eq("tournament_id",id),
   s.from("match_schedule").select("id,match_id,scheduled_order,approximate_time,mat_id,matches!inner(tournament_id)").eq("matches.tournament_id",id).order("scheduled_order"),
   s.from("categories").select("id,name").eq("tournament_id",id),
   s.from("mats").select("id,name").eq("tournament_id",id)
 ]);
 const categoryNames=Object.fromEntries((categories??[]).map(c=>[c.id,c.name]));
 const zoneNames=Object.fromEntries((mats??[]).map(m=>[m.id,m.name]));
 return <main className="container dashboard-page">
   <div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {t.name}</Link></div>
   <div className="section-header"><div><div className="eyebrow">LIVE</div><h1>Проведение</h1><p className="muted">Очередь поединков и фиксация победителей.</p></div></div>
   <RunningClient tournamentId={id} initialMatches={(matches??[]).map((m:any)=>({...m,participantA:Array.isArray(m.participants_a)?m.participants_a[0]:m.participants_a,participantB:Array.isArray(m.participants_b)?m.participants_b[0]:m.participants_b}))}
     initialSchedule={(schedule??[]).map(r=>({id:r.id,match_id:r.match_id,scheduled_order:r.scheduled_order,approximate_time:r.approximate_time,mat_id:r.mat_id}))}
     categoryNames={categoryNames} zoneNames={zoneNames}/>
 </main>;
}
