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

  const {data:rows}=await s.from("match_schedule").select("id,match_id,scheduled_order,approximate_time,mat_id,matches!inner(match_number,category_id,participants_a:participants!matches_participant_a_id_fkey(first_name,last_name),participants_b:participants!matches_participant_b_id_fkey(first_name,last_name))").eq("matches.tournament_id",id).order("scheduled_order");
  const {data:mats}=await s.from("mats").select("id,name,sort_order,is_active").eq("tournament_id",id).order("sort_order");
  const {data:categories}=await s.from("categories").select("id,name").eq("tournament_id",id);
  const categoryNames=new Map((categories??[]).map(c=>[c.id,c.name]));
  const name=(p:any)=>p?p.first_name+" "+p.last_name:"Ожидается";

  return <main className="container dashboard-page">
    <div className="page-topline"><Link className="back-link" href={"/organizer/tournaments/"+id}>← {t.name}</Link></div>
    <div className="section-header"><div><h1>Зоны и расписание</h1><p className="muted">Создайте зоны, задайте время начала и сформируйте расписание. Порядок и зону каждого боя можно менять вручную.</p></div></div>

    <section className="form-card" style={{marginBottom:16}}>
      <div className="eyebrow">ЗОНЫ</div>
      <h2>Зоны турнира</h2>
      <p className="muted">Добавляйте, переименовывайте, включайте или выключайте зоны, на которых проходят поединки.</p>
      <MatsClient tournamentId={id} initialMats={mats??[]}/>
    </section>

    <ScheduleClient tournamentId={id} startTime={t.schedule_start_time??"10:00"} initialRows={(rows??[]).map((r:any)=>{
      const m=Array.isArray(r.matches)?r.matches[0]:r.matches;
      const a=Array.isArray(m?.participants_a)?m.participants_a[0]:m?.participants_a;
      const b=Array.isArray(m?.participants_b)?m.participants_b[0]:m?.participants_b;
      return {id:r.id,match_id:r.match_id,scheduled_order:r.scheduled_order,mat_id:r.mat_id,approximate_time:r.approximate_time,match_number:m?.match_number??null,category_name:categoryNames.get(m?.category_id)??"",athletes:`${name(a)} — ${name(b)}`};
    })} mats={(mats??[]).map((m:any)=>({id:m.id,name:m.name,is_active:m.is_active}))}/>
  </main>
}
