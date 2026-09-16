import Link from "next/link";
import {notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import LiveTournament from "./live-tournament";

export default async function TournamentPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const s=await createClient();
  const {data:t}=await s.from("tournaments").select("id,name,date,city,venue,sport,description,entry_fee,registration_deadline,status,poster_url,is_public").eq("id",id).eq("is_public",true).maybeSingle();
  if(!t)notFound();
  const {data:docs}=await s.from("documents").select("id,name,storage_path,mime_type").eq("tournament_id",id).eq("is_public",true).order("created_at");
  const {data:cats}=await s.from("categories").select("id,name,age_min,age_max,weight_limit").eq("tournament_id",id).order("sort_order");
  const {data:matches}=await s.from("matches").select("id,match_number,round_number,status,winner_id,category_id,participant_a_id,participant_b_id,participants_a:participants!matches_participant_a_id_fkey(first_name,last_name),participants_b:participants!matches_participant_b_id_fkey(first_name,last_name)").eq("tournament_id",id).order("match_number");
  const {data:results}=await s.from("results").select("place,category_id,participants(first_name,last_name)").eq("tournament_id",id).order("place");
  const initialMatches=(matches??[]).map((m:any)=>({...m,participantA:Array.isArray(m.participants_a)?m.participants_a[0]:m.participants_a,participantB:Array.isArray(m.participants_b)?m.participants_b[0]:m.participants_b}));
  const registrationOpen=t.status==="registration_open";
  const publicDoc=docs?.[0]??null;
  return <main className="container public-tournament">
    <div className="page-topline"><Link className="back-link" href="/">← Главная</Link></div>
    <header className="public-hero">{t.poster_url&&<img src={t.poster_url} alt=""/>}<div><div className="eyebrow">{t.sport} · {t.city}</div><h1>{t.name}</h1><p className="muted">{new Date(t.date).toLocaleDateString("ru-RU")} · {t.venue||"Место уточняется"}</p>{t.description&&<p>{t.description}</p>}{registrationOpen&&<Link className="primary button-link" href={`/tournaments/${id}/register`}>Подать заявку</Link>}</div></header>
    <section className="info-grid"><article className="info-card"><div className="eyebrow">РЕГИСТРАЦИЯ</div><strong>{registrationOpen?"Открыта":"Закрыта"}</strong><p className="muted">{t.entry_fee!=null?`Взнос: ${t.entry_fee} ₸`:"Взнос не указан"}{t.registration_deadline?` · до ${new Date(t.registration_deadline).toLocaleDateString("ru-RU")}:""}</p></article><article className="info-card"><div className="eyebrow">СТАТУС</div><strong>{t.status}</strong><p className="muted">Публичная информация обновляется автоматически.</p></article></section>
    <section className="public-section"><h2>Категории</h2><div className="cards-grid">{(cats??[]).map((c:any)=><article className="info-card" key={c.id}><strong>{c.name}</strong><p className="muted">{c.age_min!=null&&c.age_max!=null?`${c.age_min}–${c.age_max} лет`:""}{c.weight_limit!=null?` · до ${c.weight_limit} кг`:""}</p></article>)}</div></section>
    <LiveTournament tournamentId={id} initialMatches={initialMatches} initialResults={results??[]}/>
    {publicDoc&&<section className="public-section"><h2>Положение</h2><a className="button-link secondary" href={publicDoc.storage_path} target="_blank" rel="noreferrer">Открыть положение</a></section>}
  </main>
}
