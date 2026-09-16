import Link from "next/link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";

export default async function ResultsPage({params}:{params:Promise<{id:string}>}){
 const{id}=await params;const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return null;
 const{data:organizer}=await supabase.from("organizers").select("id").eq("user_id",user.id).maybeSingle();if(!organizer)notFound();
 const{data:tournament}=await supabase.from("tournaments").select("id,name").eq("id",id).eq("organizer_id",organizer.id).single();if(!tournament)notFound();
 const{data:results,error}=await supabase.from("results").select("id,place,category_id,participant_id,categories(name),participants(first_name,last_name)").eq("tournament_id",id).order("category_id").order("place");if(error)throw new Error(error.message);
 return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div><header className="section-header"><div><div className="eyebrow">Итоги</div><h1>Результаты</h1><p className="muted">Места по завершённым категориям.</p></div></header><section className="cards-grid">{(results??[]).length===0?<div className="empty-state">Результатов пока нет.</div>:(results??[]).map((r:any)=>{const category=Array.isArray(r.categories)?r.categories[0]:r.categories;const participant=Array.isArray(r.participants)?r.participants[0]:r.participants;const name=`${participant?.first_name??""} ${participant?.last_name??""}`.trim();const place=r.place===1?"🥇":r.place===2?"🥈":r.place===3?"🥉":`${r.place}.`;return <article className="info-card" key={r.id}><div className="eyebrow">{category?.name??"Категория"}</div><h2>{place} {name||"Участник"}</h2></article>})}</section></main>;
}
