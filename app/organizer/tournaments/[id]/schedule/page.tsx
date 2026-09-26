import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleClient from "./schedule-client";
import MatsClient from "../mats/mats-client";
import { hasTournamentPermission, permissionDeniedPage } from "@/lib/tournament-permissions";

export default async function SchedulePage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const s=await createClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user)return null;
  if(!(await hasTournamentPermission(s,id,"schedule")))return permissionDeniedPage();

  const {data:t}=await s.from("tournaments").select("id,name,organizer_id,schedule_start_time").eq("id",id).single();
  if(!t)notFound();

  const [{data:o},{data:member}]=await Promise.all([
    s.from("organizers").select("id").eq("user_id",user.id).maybeSingle(),
    s.from("tournament_members").select("role").eq("tournament_id",id).eq("user_id",user.id).maybeSingle()
  ]);
  if(o?.id!==t.organizer_id&&!member)notFound();

  const {count:scheduledCount}=await s.from("match_schedule").select("id,matches!inner(tournament_id)",{count:"exact",head:true}).eq("matches.tournament_id",id);
  const {data:mats}=await s.from("mats").select("id,name,sort_order,is_active").eq("tournament_id",id).order("sort_order");
  const {data:categories}=await s.from("categories").select("id,name,age_min,age_max,weight_limit,sort_order,preferred_mat_id").eq("tournament_id",id).order("sort_order");
  const {data:matches}=await s.from("matches").select("category_id").eq("tournament_id",id);
  const matchCounts=new Map<string,number>();
  for(const m of matches??[])matchCounts.set(m.category_id,(matchCounts.get(m.category_id)??0)+1);

  return <main className="container dashboard-page">
    <div className="page-topline"><Link className="back-link" href={"/organizer/tournaments/"+id}>← {t.name}</Link></div>
    <div className="section-header"><div><h1>Зоны и расписание</h1><p className="muted">Создайте зоны, назначьте их категориям и задайте начало соревнований.</p></div></div>

    <details className="form-card" style={{marginBottom:16}}>
      <summary style={{cursor:"pointer",fontWeight:800,fontSize:22}}>Зоны турнира</summary>
      <p className="muted">Добавляйте, переименовывайте, включайте или выключайте зоны, на которых проходят поединки.</p>
      <MatsClient tournamentId={id} initialMats={mats??[]}/>
    </details>

    <ScheduleClient tournamentId={id} startTime={t.schedule_start_time??"10:00"} scheduledCount={scheduledCount??0}
      initialCategories={(categories??[]).filter(c=>matchCounts.has(c.id)).map(c=>({id:c.id,name:c.name,count:matchCounts.get(c.id)??0,preferred_mat_id:c.preferred_mat_id}))}
      mats={(mats??[]).map(m=>({id:m.id,name:m.name,is_active:m.is_active}))}/>
  </main>
}
