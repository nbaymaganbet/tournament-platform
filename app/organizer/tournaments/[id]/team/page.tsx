"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Permissions = {
  overview:boolean; participants:boolean; categories:boolean; weigh_in:boolean; brackets:boolean;
  schedule:boolean; running:boolean; results:boolean; settings:boolean; team:boolean; all_tournaments:boolean;
};

type Member = {
  user_id:string; display_name:string; email:string; role:string; created_at:string;
} & Permissions;

const permissionItems:[keyof Permissions,string,string][] = [
  ["overview","Обзор","overview"],
  ["participants","Участники","participants"],
  ["categories","Категории","categories"],
  ["weigh_in","Взвешивание","weigh_in"],
  ["brackets","Сетка","brackets"],
  ["schedule","Расписание","schedule"],
  ["running","Проведение","running"],
  ["results","Результаты","results"],
  ["settings","Настройки","settings"],
  ["team","Команда","team"],
  ["all_tournaments","Все турниры","all_tournaments"],
];

const defaultPermissions:Permissions = {
  overview:true, participants:true, categories:false, weigh_in:true, brackets:false,
  schedule:true, running:true, results:true, settings:false, team:false, all_tournaments:false,
};

export default function TournamentTeamPage(){
 const {id}=useParams<{id:string}>(); const router=useRouter();
 const [members,setMembers]=useState<Member[]>([]);
 const [email,setEmail]=useState("");
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false);
 const [savingPermissions,setSavingPermissions]=useState<string|null>(null);
 const [openPermissions,setOpenPermissions]=useState<string|null>(null);
 const [error,setError]=useState(""); const [ok,setOk]=useState("");
 const [ru,setRu]=useState(true);

 useEffect(()=>{setRu(localStorage.getItem("tp-lang")!=="kk");},[]);

 async function load(){
   const s=createClient();
   const {data:user}=await s.auth.getUser();
   if(!user.user){router.replace("/login");return;}
   const {data:allowed}=await s.rpc("has_tournament_permission",{p_tournament_uuid:id,p_permission_key:"team"});
   if(allowed!==true){setError(ru?"Этот раздел недоступен для вашей роли.":"Бұл бөлім сіздің рөліңіз үшін қолжетімсіз.");setLoading(false);return;}
   const {data,error:e}=await s.rpc("list_tournament_members_with_permissions",{p_tournament_uuid:id});
   if(e){setError(e.message);setLoading(false);return;}
   setMembers((data||[]) as Member[]); setLoading(false);
 }
 useEffect(()=>{load();},[id]);

 async function add(e:FormEvent){
   e.preventDefault(); setSaving(true); setError(""); setOk("");
   const {data,error:e2}=await createClient().rpc("add_tournament_member_by_email",{
     tournament_uuid:id,member_email:email.trim().toLowerCase(),member_role:"operator"
   });
   if(e2){setError(e2.message);setSaving(false);return;}
   const added=(data||[])[0];
   if(added){
     setMembers(current=>[...current,{...added,...defaultPermissions} as Member]);
   } else {
     await load();
   }
   setEmail(""); setOk(ru?"Сотрудник добавлен. Настройте его разрешения ниже.":"Қызметкер қосылды. Төменде оның рұқсаттарын баптаңыз.");
   setSaving(false);
 }

 function toggle(userId:string,key:keyof Permissions){
   setMembers(current=>current.map(m=>m.user_id===userId?{...m,[key]:!m[key]}:m));
 }

 async function savePermissions(member:Member){
   setSavingPermissions(member.user_id); setError(""); setOk("");
   const {error:e}=await createClient().rpc("set_tournament_member_permissions",{
     p_tournament_uuid:id,p_member_user_id:member.user_id,
     p_overview:member.overview,p_participants:member.participants,p_categories:member.categories,
     p_weigh_in:member.weigh_in,p_brackets:member.brackets,p_schedule:member.schedule,
     p_running:member.running,p_results:member.results,p_settings:member.settings,
     p_team:member.team,p_all_tournaments:member.all_tournaments
   });
   if(e){setError(e.message);setSavingPermissions(null);return;}
   setOk(ru?"Разрешения сохранены.":"Рұқсаттар сақталды.");
   setSavingPermissions(null);
 }

 async function remove(user_id:string){
   if(!confirm(ru?"Убрать доступ этому пользователю?":"Бұл пайдаланушының қолжетімділігін алып тастау керек пе?"))return;
   const {error:e}=await createClient().rpc("remove_tournament_member",{tournament_uuid:id,member_user_id:user_id});
   if(e){setError(e.message);return;}
   setMembers(current=>current.filter(m=>m.user_id!==user_id));
 }

 if(loading)return <main className="container dashboard-page"><p className="muted">{ru?"Загрузка…":"Жүктелуде…"}</p></main>;

 return <main className="container dashboard-page">
  <div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {ru?"Турнир":"Жарыс"}</Link></div>
  <section className="form-card">
   <div className="eyebrow">{ru?"КОМАНДА":"КОМАНДА"}</div>
   <h1>{ru?"Доступ к турниру":"Жарысқа қолжетімділік"}</h1>
   <p className="muted">{ru?"Добавьте зарегистрированного сотрудника по email. Доступ к разделам настраивается отдельно для этого турнира.":"Тіркелген қызметкерді email арқылы қосыңыз. Бөлімдерге қолжетімділік осы жарыс үшін бөлек бапталады."}</p>
   <form className="tournament-form" onSubmit={add}>
    <label>{ru?"Email сотрудника":"Қызметкердің email-і"}<input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="organizer@example.com" required/></label>
    {error&&<p className="error" role="alert">{error}</p>}
    {ok&&<p className="success" role="status">{ok}</p>}
    <button className="primary" disabled={saving}>{saving?(ru?"Добавляем…":"Қосылуда…"):(ru?"Добавить сотрудника":"Қызметкерді қосу")}</button>
   </form>
   <section className="panel">
    <h2>{ru?"Сотрудники":"Қызметкерлер"}</h2>
    {members.length===0?<p className="muted">{ru?"Пока никто не добавлен.":"Әзірге ешкім қосылмаған."}</p>:members.map(m=><article className="list-row" key={m.user_id} style={{display:"block"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
       <div><strong>{m.display_name}</strong><p className="muted">{m.email}</p></div>
       <button className="button-link secondary" type="button" onClick={()=>remove(m.user_id)}>{ru?"Убрать":"Алып тастау"}</button>
      </div>
      <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #292d34"}}>
       <button className="button-link secondary" type="button" onClick={()=>setOpenPermissions(openPermissions===m.user_id?null:m.user_id)}>
         {openPermissions===m.user_id?(ru?"Скрыть разрешения":"Рұқсаттарды жасыру"):(ru?"Разрешения":"Рұқсаттар")}
       </button>
       {openPermissions===m.user_id&&<div style={{marginTop:12}}>
        <div style={{display:"grid",gap:8}}>
         {permissionItems.map(([key,label])=><label key={key} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
           <input type="checkbox" checked={m[key]} onChange={()=>toggle(m.user_id,key)} />
           <span>{ru?label:({overview:"Шолу",participants:"Қатысушылар",categories:"Санаттар",weigh_in:"Өлшеу",brackets:"Тор",schedule:"Кесте",running:"Өткізу",results:"Нәтижелер",settings:"Баптаулар",team:"Команда",all_tournaments:"Барлық жарыстар"} as Record<string,string>)[key]}</span>
         </label>)}
        </div>
        <button className="primary" type="button" style={{marginTop:14}} disabled={savingPermissions===m.user_id} onClick={()=>savePermissions(m)}>
          {savingPermissions===m.user_id?(ru?"Сохраняем…":"Сақталуда…"):(ru?"Сохранить разрешения":"Рұқсаттарды сақтау")}
        </button>
       </div>}
      </div>
    </article>)}
   </section>
  </section>
 </main>;
}
