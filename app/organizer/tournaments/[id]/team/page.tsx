"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Member={user_id:string;display_name:string;email:string;role:string;created_at:string};

export default function TournamentTeamPage(){
 const {id}=useParams<{id:string}>();const router=useRouter();const [members,setMembers]=useState<Member[]>([]);const [email,setEmail]=useState("");const [role,setRole]=useState("operator");const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [ok,setOk]=useState("");const [ownerEmail,setOwnerEmail]=useState("");const [ru,setRu]=useState(true);
 useEffect(()=>{const saved=localStorage.getItem("tp-lang");setRu(saved!=="kk");},[]);
 async function load(){const s=createClient();const {data:user}=await s.auth.getUser();if(!user.user){router.replace("/login");return;}const {data:owner}=await s.from("organizers").select("email").eq("user_id",user.user.id).maybeSingle();setOwnerEmail(owner?.email||user.user.email||"");const {data,error:e}=await s.rpc("list_tournament_members",{tournament_uuid:id});if(e)setError(e.message);setMembers((data||[]) as Member[]);setLoading(false);}
 useEffect(()=>{load();},[id]);
 async function add(e:FormEvent){e.preventDefault();setSaving(true);setError("");setOk("");const {data,error:e2}=await createClient().rpc("add_tournament_member_by_email",{tournament_uuid:id,member_email:email.trim().toLowerCase(),member_role:role});if(e2){setError(e2.message);setSaving(false);return;}setEmail("");setOk(ru?"Доступ выдан.":"Қолжетімділік берілді.");setMembers(current=>[...current,...((data||[]) as Member[])]);setSaving(false);}
 async function remove(user_id:string){if(!confirm(ru?"Убрать доступ этому пользователю?":"Бұл пайдаланушының қолжетімділігін алып тастау керек пе?"))return;const {error:e}=await createClient().rpc("remove_tournament_member",{tournament_uuid:id,member_user_id:user_id});if(e){setError(e.message);return;}setMembers(current=>current.filter(m=>m.user_id!==user_id));}
 if(loading)return <main className="container dashboard-page"><p className="muted">{ru?"Загрузка…":"Жүктелуде…"}</p></main>;
 return <main className="container dashboard-page"><div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {ru?"Турнир":"Жарыс"}</Link></div><section className="form-card"><div className="eyebrow">{ru?"КОМАНДА":"КОМАНДА"}</div><h1>{ru?"Доступ к турниру":"Жарысқа қолжетімділік"}</h1><p className="muted">{ru?"Добавляйте других зарегистрированных организаторов по email. Они смогут войти под своим email и работать с участниками, категориями, сетками, расписанием, коврами и проведением этого турнира.":"Тіркелген басқа ұйымдастырушыларды email арқылы қосыңыз. Олар өз email-і арқылы кіріп, осы жарыстың қатысушыларымен, санаттарымен, торларымен, кестесімен және өткізу режимімен жұмыс істей алады."}</p>
 <div className="panel"><strong>{ru?"Владелец":"Иесі"}</strong><p className="muted">{ownerEmail}</p></div>
 <form className="tournament-form" onSubmit={add}><label>Email сотрудника<input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="organizer@example.com" required/></label><label>{ru?"Роль":"Рөл"}<select className="field" value={role} onChange={e=>setRole(e.target.value)}><option value="operator">{ru?"Оператор — проведение и рабочие разделы":"Оператор — өткізу және жұмыс бөлімдері"}</option><option value="manager">{ru?"Менеджер — полный доступ":"Менеджер — толық қолжетімділік"}</option></select></label>{error&&<p className="error" role="alert">{error}</p>}{ok&&<p className="success" role="status">{ok}</p>}<button className="primary" disabled={saving}>{saving?(ru?"Добавляем…":"Қосылуда…"):(ru?"Выдать доступ":"Қолжетімділік беру")}</button></form>
 <section className="panel"><h2>{ru?"Участники команды":"Команда мүшелері"}</h2>{members.length===0?<p className="muted">{ru?"Пока никто не добавлен.":"Әзірге ешкім қосылмаған."}</p>:members.map(m=><div className="list-row" key={m.user_id}><div><strong>{m.display_name}</strong><p className="muted">{m.email} · {m.role}</p></div><button className="button-link secondary" type="button" onClick={()=>remove(m.user_id)}>{ru?"Убрать":"Алып тастау"}</button></div>)}</section>
 </section></main>;
}
