import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {getLocale} from "@/lib/i18n-server";
import {isByeSeed,matchRole,pendingAthlete} from "@/lib/bracket-display";

type BracketRow={id:string;match_number:number;round_number:number;status:string;participant_a_name:string|null;participant_b_name:string|null;next_match_number:number|null;next_match_id:string|null;loser_next_match_id:string|null;has_winner:boolean;participant_a_is_bye:boolean;participant_b_is_bye:boolean};

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
    <div className="participant-main"><strong>{kk?"Жекпе-жек":"Бой"} #{m.match_number}{matchRole(m,matches)==="final"?" · Финал":matchRole(m,matches)==="third"?(kk?" · 3-орын үшін":" · За 3-е место"):""}</strong>
     <span>{m.participant_a_name??pendingAthlete(m,"a",matches,kk)}{isByeSeed(m,"a",matches)?(kk?" · Бойсыз өтті (BYE)":" · Прошёл без боя (BYE)"):""}</span>
     <span>{m.participant_b_name??pendingAthlete(m,"b",matches,kk)}{isByeSeed(m,"b",matches)?(kk?" · Бойсыз өтті (BYE)":" · Прошёл без боя (BYE)"):""}</span>
     {m.next_match_number&&<span className="muted">{kk?"Жеңімпаз келесі жекпе-жекке өтеді":"Победитель переходит в бой"} #{m.next_match_number}</span>}
     {m.loser_next_match_id&&<span className="muted">{kk?"Жеңілген келесі жекпе-жекке өтеді":"Проигравший переходит в бой"} #{matches.find(next=>next.id===m.loser_next_match_id)?.match_number??"—"}</span>}
    </div><span className="status-pill">{m.status==="completed"?(kk?"Аяқталды":"Завершён"):m.status==="ready"?(kk?"Дайын":"Готов"):m.status==="in_progress"?(kk?"Өтіп жатыр":"Идёт"):kk?"Жоспарда":"Запланирован"}</span>
   </article>)}</div>
  </section>)}
  {!matches.length&&<div className="empty-state">{kk?"Тор әлі қалыптаспаған.":"Сетка ещё не сформирована."}</div>}
 </main>;
}
