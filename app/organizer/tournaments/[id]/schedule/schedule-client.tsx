"use client";
import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
export default function ScheduleClient({tournamentId}:{tournamentId:string}){const[saving,setSaving]=useState(false);const[message,setMessage]=useState("");const s=createClient();async function generate(){setSaving(true);setMessage("");const{data,error}=await s.rpc("generate_tournament_schedule",{p_tournament_id:tournamentId});setMessage(error?error.message:`Готово. В расписание добавлено боёв: ${data??0}`);setSaving(false)}return <div className="actions"><button className="primary" disabled={saving} onClick={generate}>{saving?"Формируем…":"Сформировать расписание"}</button>{message&&<span className="muted">{message}</span>}</div>}
