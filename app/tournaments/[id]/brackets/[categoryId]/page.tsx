import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {getLocale} from "@/lib/i18n-server";

type BracketRow={match_number:number;round_number:number;status:string;participant_a_name:string|null;participant_b_name:string|null;next_match_number:number|null};

export default async function PublicCategoryBracket({params}:{params:Promise<{id:string;categoryId:string}>}){
 const{id,categoryId}=await params;
 const s=await createClient();
 const locale=await getLocale(),kk=locale==="kk";
 const{data:tournament}=await s.from("tournaments").select("name").eq("id",id).eq("is_public",true).neq("status","draft").maybeSingle();
 if(!tournament)notFound();
 const{data:category}=await s.from("categories").select("name").eq("id",categoryId).eq("tournament_id",id).maybeSingle();
 if(!category)notFound();
 const{data,error}=await s.rpc("get_public_category_bracket",{p_tournament_id:id,p_category_id:categoryId});
 if(error)throw new Error("Could not load the bracket");
 const matches=(data??[]) as BracketRow[];
 const rounds=[...new Set(matches.map(m=>m.round_number))].sort((a,b)=>a-b);
 return <main className="container dashboard-page">
  <div className="section-header"><div><div className="eyebrow">{tournament.name}</div><h1>{category.name}</h1><p className="muted">{kk?"Жекпе-жек торы":"Сетка боёв"}</p></div></div>
  {rounds.map(round=><section key={round} className="form-card" style={{marginBottom:16}}>
   <h2>{kk?"Кезең":"Раунд"} {round}</h2>
   <div className="category-list">{matches.filter(m=>m.round_number===round).map(m=><article className="participant-card" key={m.match_number}>
    <div className="participant-main"><strong>{kk?"Жекпе-жек":"Бой"} #{m.match_number}</strong>
     <span>{m.participant_a_name??(kk?"Қатысушы күтілуде":"Ожидается участник")} — {m.participant_b_name??(kk?"Қатысушы күтілуде":"Ожидается участник")}</span>
     {m.next_match_number&&<span className="muted">{kk?"Жеңімпаз келесі жекпе-жекке өтеді":"Победитель переходит в бой"} #{m.next_match_number}</span>}
    </div><span className="status-pill">{m.status==="completed"?(kk?"Аяқталды":"Завершён"):m.status==="ready"?(kk?"Дайын":"Готов"):kk?"Жоспарда":"Запланирован"}</span>
   </article>)}</div>
  </section>)}
  {!matches.length&&<div className="empty-state">{kk?"Тор әлі қалыптаспаған.":"Сетка ещё не сформирована."}</div>}
 </main>;
}
