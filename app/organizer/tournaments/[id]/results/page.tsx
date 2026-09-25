import Link from "next/link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import { hasTournamentPermission, permissionDeniedPage } from "@/lib/tournament-permissions";

export default async function ResultsPage({params}:{params:Promise<{id:string}>}){
 const{id}=await params;const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return null;if(!(await hasTournamentPermission(supabase,id,"results")))return permissionDeniedPage();
 const{data:organizer}=await supabase.from("organizers").select("id").eq("user_id",user.id).maybeSingle();
 const{data:tournament}=await supabase.from("tournaments").select("id,name,organizer_id").eq("id",id).single();if(!tournament)notFound();
 const{data:member}=await supabase.from("tournament_members").select("role").eq("tournament_id",id).eq("user_id",user.id).maybeSingle();
 if(organizer?.id!==tournament.organizer_id&&!member)notFound();
 const{data:results,error}=await supabase.from("results").select("id,place,category_id,participant_id,categories(name),participants(first_name,last_name,age,club,coach)").eq("tournament_id",id).order("category_id").order("place");if(error)throw new Error(error.message);
 return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div><header className="section-header"><div><div className="eyebrow">Итоги</div><h1>Результаты</h1><p className="muted">Места по завершённым категориям.</p></div></header><section className="cards-grid">{(results??[]).length===0?<div className="empty-state">Результатов пока нет.</div>:(results??[]).map((r:any)=>{const category=Array.isArray(r.categories)?r.categories[0]:r.categories;const participant=Array.isArray(r.participants)?r.participants[0]:r.participants;const name=`${participant?.first_name??""} ${participant?.last_name??""}`.trim();const place=r.place===1?"🥇":r.place===2?"🥈":r.place===3?"🥉":`${r.place}.`;return <article className="info-card" key={r.id}><div className="eyebrow">{category?.name??"Категория"}</div><h2>{place} {name||"Участник"}</h2><p className="muted">{participant?.age??"—"} лет · {participant?.club||"Клуб не указан"} · {participant?.coach||"Тренер не указан"}</p></article>})}</section></main>;
}
