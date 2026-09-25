import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MatsClient from "./mats-client";
export default async function MatsPage({ params }: { params: Promise<{ id: string }> }) {
 const {id}=await params; const s=await createClient(); const {data:{user}}=await s.auth.getUser(); if(!user)return null; const {data:o}=await s.from("organizers").select("id").eq("user_id",user.id).maybeSingle(); if(!o)notFound(); const {data:t}=await s.from("tournaments").select("id,name").eq("id",id).eq("organizer_id",o.id).single(); if(!t)notFound(); const {data:mats,error}=await s.from("mats").select("id,name,sort_order,is_active").eq("tournament_id",id).order("sort_order"); if(error)throw new Error(error.message);
 return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {t.name}</Link></div><div className="section-header"><div><div className="eyebrow">ПРОВЕДЕНИЕ</div><h1>Зоны</h1><p className="muted">Создайте площадки, на которых будут проходить поединки.</p></div></div><MatsClient tournamentId={id} initialMats={mats??[]}/></main>;
}
