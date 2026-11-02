import Link from "@/components/pending-link";
import LiveRefresh from "@/components/live-refresh";
import PublicEventList from "@/components/public-event-list";
import {createClient} from "@/lib/supabase/server";
import {getLocale} from "@/lib/i18n-server";
import {notFound} from "next/navigation";
export default async function Page({params}:{params:Promise<{id:string}>}){
 const {id}=await params,s=await createClient(),locale=await getLocale(),kk=locale==="kk";
 const [{data:t},{data,error}]=await Promise.all([s.from("tournaments").select("name").eq("id",id).eq("is_public",true).neq("status","draft").maybeSingle(),s.rpc("get_public_event_data",{p_tournament_id:id})]);
 if(error)throw new Error("Could not load event");if(!t||!data)notFound();
 return <main className="container dashboard-page"><LiveRefresh tournamentId={id} tables="tournaments,categories,brackets,registrations,category_participants,matches,match_schedule,results"/><Link className="back-link" href={`/tournaments/${id}`}>← {t.name}</Link><h1>{kk?"Торлар мен кесте":"Сетки и расписание"}</h1><PublicEventList id={id} title={t.name} data={data} kk={kk} mode="brackets"/></main>;
}
