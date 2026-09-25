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

  const {data:t}=await s.from("tournaments").select("id,name,organizer_id,zone_count,schedule_start_time").eq("id",id).single();
  if(!t)notFound();

  const [{data:o},{data:member}]=await Promise.all([
    s.from("organizers").select("id").eq("user_id",user.id).maybeSingle(),
    s.from("tournament_members").select("role").eq("tournament_id",id).eq("user_id",user.id).maybeSingle()
  ]);
  if(o?.id!==t.organizer_id&&!member)notFound();

  const {data:rows}=await s.from("match_schedule").select("id,match_id,scheduled_order,approximate_time,mat_id,matches(match_number,category_id,participant_a_id,participant_b_id,status,participants_a:participants!matches_participant_a_id_fkey(first_name,last_name),participants_b:participants!matches_participant_b_id_fkey(first_name,last_name)),mats(name)").eq("matches.tournament_id",id).order("scheduled_order");
  const {data:mats}=await s.from("mats").select("id,name,sort_order,is_active").eq("tournament_id",id).order("sort_order");
  const name=(p:any)=>p?p.first_name+" "+p.last_name:"Ожидается";

  return <main className="container dashboard-page">
    <div className="page-topline"><Link className="back-link" href={"/organizer/tournaments/"+id}>← {t.name}</Link></div>
    <div className="section-header"><div><div className="eyebrow">ПРОВЕДЕНИЕ</div><h1>Зоны и расписание</h1><p className="muted">Сначала создайте зоны, затем сформируйте расписание автоматически. После этого порядок и зона для каждого боя можно менять вручную.</p></div></div>

    <section className="form-card" style={{marginBottom:16}}>
      <div className="eyebrow">ЗОНЫ</div>
      <h2>Зоны турнира</h2>
      <p className="muted">Добавляйте, переименовывайте, включайте или выключайте зоны, на которых проходят поединки.</p>
      <MatsClient tournamentId={id} initialMats={mats??[]}/>
    </section>

    <ScheduleClient tournamentId={id} zoneCount={t.zone_count??1} startTime={t.schedule_start_time??"10:00"} initialRows={(rows??[]).map((r:any)=>({id:r.id,match_id:r.match_id,scheduled_order:r.scheduled_order,mat_id:r.mat_id}))} mats={(mats??[]).map((m:any)=>({id:m.id,name:m.name,is_active:m.is_active}))}/>

    <section className="category-list">
      {(rows??[]).length===0?<div className="empty-state">Расписание пока пустое. Сначала создайте сетки и активные зоны.</div>:(rows??[]).map((r:any)=>{
        const m=Array.isArray(r.matches)?r.matches[0]:r.matches;
        const a=Array.isArray(m?.participants_a)?m.participants_a[0]:m?.participants_a;
        const b=Array.isArray(m?.participants_b)?m.participants_b[0]:m?.participants_b;
        const mat=Array.isArray(r.mats)?r.mats[0]:r.mats;
        return <article className="participant-card" key={r.id}><div className="participant-main"><strong>#{r.scheduled_order} · Бой #{m?.match_number??"—"}</strong><span>{name(a)} — {name(b)}</span></div><span className="status-pill">{mat?.name??"Зона не назначена"}</span></article>
      })}
    </section>
  </main>
}
