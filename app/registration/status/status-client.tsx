"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = {
  application_number: string;
  participant_name: string;
  tournament_name: string;
  tournament_id: string;
  registration_status: string;
  payment_status: string;
  category_name: string | null;
  match_number: number | null;
  round_number: number | null;
  match_status: string | null;
  mat_name: string | null;
  scheduled_order: number | null;
  approximate_time: string | null;
};

export default function StatusClient({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [data, setData] = useState<Status | null>(null);
  const [busy, setBusy] = useState(Boolean(initialToken));
  const [error, setError] = useState("");
  const [locale, setLocale] = useState<"ru"|"kk">("ru");
  const supabase = createClient();
  const kk = locale === "kk";

  useEffect(() => { if (localStorage.getItem("tp-lang") === "kk") setLocale("kk"); }, []);

  async function load(value = token) {
    const clean = value.trim();
    if (!clean) { setError(kk ? "Қолжетімділік кодын енгізіңіз немесе қорғалған сілтемені ашыңыз." : "Введите код доступа или откройте защищённую ссылку."); return; }
    setBusy(true); setError(""); setData(null);
    const { data: rows, error: rpcError } = await supabase.rpc("get_registration_status", { p_status_token: clean });
    if (rpcError || !rows?.[0]) setError(rpcError?.message || (kk ? "Өтінім табылмады. Сілтемені немесе кодты тексеріңіз." : "Заявка не найдена. Проверьте ссылку или код доступа."));
    else setData(rows[0] as Status);
    setBusy(false);
  }

  useEffect(() => { if (initialToken) void load(initialToken); }, [initialToken]);

  const registrationLabel = (status:string) => ({pending_confirmation:kk?"Растауды күтуде":"На рассмотрении",awaiting_payment:kk?"Төлемді күтуде":"Ожидает оплаты",payment_confirmed:kk?"Төлем расталды":"Оплата подтверждена",confirmed:kk?"Қатысу расталды":"Участие подтверждено",category_formed:kk?"Санат қалыптасты":"Категория сформирована",withdrawn:kk?"Қатысу тоқтатылды":"Участник снят"}[status] ?? status);
  const matchLabel = (status:string|null) => ({scheduled:kk?"Кезекте":"Запланирован",ready:kk?"Шығуға дайын":"Готов к бою",running:kk?"Қазір өтіп жатыр":"Идёт сейчас",completed:kk?"Аяқталды":"Завершён"}[status ?? ""] ?? status);

  return <section className="category-list">
    <div className="form-card">
      <label>{kk ? "Қолжетімділік коды" : "Код доступа"}<input className="field" value={token} onChange={e => setToken(e.target.value)} placeholder={kk ? "Сілтемедегі кодты енгізіңіз" : "Вставьте код из ссылки"} autoComplete="off" /></label>
      <button className="primary" disabled={busy} onClick={() => void load()} style={{width:"100%",marginTop:10}}>{busy ? "…" : (kk ? "Статусты тексеру" : "Проверить статус")}</button>
      {error && <p className="error-box">{error}</p>}
    </div>
    {data && <article className="participant-card" style={{display:"block",padding:18}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
        <div className="participant-main"><strong style={{fontSize:22}}>{data.participant_name}</strong><span className="muted">{data.application_number}</span></div>
        <span className="status" style={{margin:0,background:data.registration_status === "confirmed" || data.registration_status === "category_formed" ? "rgba(53,200,117,.1)" : "rgba(225,6,0,.12)",borderColor:data.registration_status === "confirmed" || data.registration_status === "category_formed" ? "rgba(53,200,117,.3)" : "rgba(225,6,0,.25)",color:data.registration_status === "confirmed" || data.registration_status === "category_formed" ? "#6fe39b" : "#ff625d"}}>{registrationLabel(data.registration_status)}</span>
      </div>
      <div className="stats-grid" style={{marginTop:16}}>
        <div><span>Турнир</span><strong>{data.tournament_name}</strong></div>
        <div><span>{kk ? "Санат" : "Категория"}</span><strong>{data.category_name ?? (kk ? "Әзірге тағайындалмаған" : "Пока не назначена")}</strong></div>
        <div><span>{kk ? "Төлем" : "Оплата"}</span><strong>{data.payment_status === "paid" ? (kk ? "Төлем расталды" : "Оплачено") : (kk ? "Төлем расталмаған" : "Не оплачено")}</strong></div>
        <div><span>{kk ? "Шығу кезегі" : "Очередь выхода"}</span><strong>{data.scheduled_order ? `#${data.scheduled_order}` : (kk ? "Әзірге жоқ" : "Пока нет")}</strong></div>
      </div>
      <div className="success-card" style={{marginTop:14,textAlign:"left",background:"linear-gradient(145deg,rgba(225,6,0,.08),var(--surface))",borderColor:"rgba(225,6,0,.25)"}}>
        <h3 style={{marginTop:0}}>{kk ? "Жарысқа шығу" : "Выход на ковёр"}</h3>
        {data.match_number ? <div style={{display:"grid",gap:8}}>
          <p style={{margin:0}}><strong>{kk ? "Жекпе-жек" : "Бой"} #{data.match_number}</strong>{data.round_number ? ` · Раунд ${data.round_number}` : ""}</p>
          {data.scheduled_order && <p style={{margin:0}}>{kk ? "Жалпы кезек" : "Порядковый номер в расписании"}: <strong>#{data.scheduled_order}</strong></p>}
          {data.mat_name && <p style={{margin:0}}>{kk ? "Кілем" : "Ковёр"}: <strong>{data.mat_name}</strong></p>}
          <p style={{margin:0}}>{matchLabel(data.match_status)}</p>
          {data.approximate_time && <p style={{margin:0}}>{kk ? "Шамамен уақыт" : "Ориентировочное время"}: <strong>{new Date(data.approximate_time).toLocaleString(kk ? "kk-KZ" : "ru-RU", { dateStyle:"short", timeStyle:"short" })}</strong></p>}
        </div> : <p className="muted" style={{marginBottom:0}}>{kk ? "Кілем, кезек және уақыт тор мен кесте қалыптасқаннан кейін пайда болады." : "Ковёр, очередь и время появятся после формирования сетки и расписания."}</p>}
      </div>
    </article>}
  </section>;
}
