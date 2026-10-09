import { uiText } from "@/lib/ui-text";
import { getLocale } from "@/lib/i18n-server";
import Link from "next/link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import { hasTournamentPermission, permissionDeniedPage } from "@/lib/tournament-permissions";
import RoundRobinTies, {type TieCategory} from "./round-robin-ties";
import ResultCategory, {type ResultAthlete} from "@/components/result-category";

import "@/app/tournaments/[id]/results/results.css";

export default async function ResultsPage({params}:{params:Promise<{id:string}>}){
 const L = (text: string) => uiText(locale, text);

 const{id}=await params;const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return null;if(!(await hasTournamentPermission(supabase,id,"results")))return permissionDeniedPage();
 const{data:organizer}=await supabase.from("organizers").select("id").eq("user_id",user.id).maybeSingle();
 const{data:tournament}=await supabase.from("tournaments").select("id,name,organizer_id,status,is_public").eq("id",id).single();if(!tournament)notFound();
 const{data:member}=await supabase.from("tournament_members").select("role").eq("tournament_id",id).eq("user_id",user.id).maybeSingle();
 if(organizer?.id!==tournament.organizer_id&&!member)notFound();
 const{data:results,error}=await supabase.from("results").select("id,place,category_id,participant_id,categories(name),participants(first_name,last_name,age,club,coach)").eq("tournament_id",id).order("category_id").order("place");if(error)throw new Error(error.message);
 const{data:tournamentCategories}=await supabase.from("categories").select("id").eq("tournament_id",id);
 const categoryIds=(tournamentCategories??[]).map(c=>c.id);
 const{data:formatRows}=categoryIds.length?await supabase.from("brackets").select("category_id,categories(name),matches(id,status,participant_a_id,participant_b_id,winner_id)").eq("format","round_robin").in("category_id",categoryIds):{data:[]};
 const ids=new Set((results??[]).map(r=>r.category_id));
 const unfinished=(formatRows??[]).filter((row:any)=>!ids.has(row.category_id)&&row.matches?.length&&row.matches.every((m:any)=>m.status==="completed"));
 const participantIds=[...new Set(unfinished.flatMap((row:any)=>row.matches.flatMap((m:any)=>[m.participant_a_id,m.participant_b_id])))];
 const{data:people}=participantIds.length?await supabase.from("participants").select("id,first_name,last_name").in("id",participantIds):{data:[]};
 const names=new Map((people??[]).map(p=>[p.id,`${p.first_name} ${p.last_name}`]));
 const ties:TieCategory[]=unfinished.map((row:any)=>{
  const category=Array.isArray(row.categories)?row.categories[0]:row.categories;
  return {id:row.category_id,name:category?.name??L("Категория"),athletes:[...new Set<string>(row.matches.flatMap((m:any)=>[m.participant_a_id,m.participant_b_id]))].map(athleteId=>({id:athleteId,name:names.get(athleteId)??L("Участник"),wins:row.matches.filter((m:any)=>m.winner_id===athleteId).length})).sort((a,b)=>b.wins-a.wins||a.name.localeCompare(b.name))};
 });
 const locale=await getLocale();
 const groups=new Map<string,{name:string;athletes:ResultAthlete[]}>();
 for(const r of (results??[]) as any[]){
  const category=Array.isArray(r.categories)?r.categories[0]:r.categories;
  const participant=Array.isArray(r.participants)?r.participants[0]:r.participants;
  const group=groups.get(r.category_id)??{name:category?.name??L("Категория"),athletes:[] as ResultAthlete[]};
  group.athletes.push({id:r.id,place:r.place,name:`${participant?.first_name??""} ${participant?.last_name??""}`.trim(),age:participant?.age??null,club:participant?.club??null,coach:participant?.coach??null});
  groups.set(r.category_id,group);
 }
 return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div><header className="section-header"><div><div className="eyebrow">{L("Итоги")}</div><h1>{L("Результаты")}</h1><p className="muted">{L("Места по завершённым категориям.")}</p></div></header><RoundRobinTies categories={ties}/>{groups.size===0?<div className="empty-state">{L("Результатов пока нет.")}</div>:[...groups].map(([categoryId,group])=><ResultCategory key={categoryId} tournamentId={id} tournamentName={tournament.name} categoryId={categoryId} categoryName={group.name} athletes={group.athletes} locale={locale} share={tournament.is_public&&tournament.status==="completed"}/>)}</main>;
}

