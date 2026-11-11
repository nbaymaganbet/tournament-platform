"use client";
import { ActionScope, useActionFeedback } from "@/components/action-feedback";
import { uiText } from "@/lib/ui-text";
import { useLocale } from "@/components/locale-provider";


import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPoster } from "@/lib/poster-upload";
import TournamentSportFields, { type SportSettings } from "@/components/tournament-sport-fields";
import PosterFiles from "@/components/poster-files";
import { createClient } from "@/lib/supabase/client";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

export default function NewTournamentPage() {
 const locale = useLocale();const L = (text: string) => uiText(locale, text);

  const router = useRouter();
  const [name, setName] = useState("");
  const [details, setDetails] = useState({ date: "", city: "", venue: "", description: "", regulations: "" });
  const [sportSettings, setSportSettings] = useState<SportSettings>({ sport: "", divisions: [], victoryMethods: null });
  const [bracketFormat, setBracketFormat] = useState<"single_elimination" | "round_robin">("single_elimination");
  const [bronzeBout, setBronzeBout] = useState(true);
  const [posters, setPosters] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const action = useActionFeedback(() => { setSaving(false); });
 async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return action.run(async () => {
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!name.trim()) {
      setError(L("Введите название соревнования."));
      setSaving(false);
      return;
    }
    if ((publish && !sportSettings.sport) || sportSettings.victoryMethods?.length === 0) {
      setError(locale === "ru" ? "Выберите вид спорта и хотя бы один способ победы." : "Спорт түрін және кемінде бір жеңіс тәсілін таңдаңыз.");
      setSaving(false);
      return;
    }
    if (posters.length > 5) {
      setError(L("Можно добавить максимум 5 афиш."));
      setSaving(false);
      return;
    }

    let { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
    if (!organizer) {
      const { data: createdOrganizer, error: organizerError } = await supabase
        .from("organizers")
        .insert({ user_id: user.id, display_name: user.email ?? "Организатор", email: user.email?.toLowerCase() ?? null })
        .select("id")
        .single();
      if (organizerError || !createdOrganizer) {
        setError(organizerError?.message ?? L("Не удалось создать профиль организатора."));
        setSaving(false);
        return;
      }
      organizer = createdOrganizer;
    }

    const slug = `${slugify(name) || "tournament"}-${Date.now().toString().slice(-6)}`;
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({ organizer_id: organizer.id, name: name.trim(), slug, date: details.date || null, city: details.city.trim() || null,
        venue: details.venue.trim() || null, description: details.description.trim() || null,
        regulations_text: details.regulations.trim() || null, sport: sportSettings.sport || null,
        divisions: sportSettings.divisions, victory_methods: sportSettings.victoryMethods, status: "draft", is_public: false, bracket_format: bracketFormat, bronze_bout: bracketFormat === "single_elimination" && bronzeBout })
      .select("id")
      .single();

    if (tournamentError || !tournament) {
      setError(tournamentError?.message ?? L("Не удалось создать соревнование."));
      setSaving(false);
      return;
    }

    const uploadErrors: string[] = [];
    const posterRows: { tournament_id: string; storage_path: string; public_url: string; sort_order: number }[] = [];

    for (let index = 0; index < posters.length; index += 1) {
      const poster = posters[index];
      try {
        const uploaded = await uploadPoster(supabase, poster, organizer.id, tournament.id);
        posterRows.push({ tournament_id: tournament.id, ...uploaded, sort_order: index });
      } catch (error) {
        uploadErrors.push(`${L("Афиша ")}${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (posterRows.length) {
      const { error: postersError } = await supabase.from("tournament_posters").insert(posterRows);
      if (postersError) uploadErrors.push(`${L("Афиши")}: ${postersError.message}`);

      const firstPoster = posterRows[0];
      await supabase.from("tournaments").update({ poster_url: firstPoster.public_url }).eq("id", tournament.id);
    }

    if (uploadErrors.length) {
      setError(`${locale === "kk" ? "Жоба құрылды, бірақ кейбір афишалар жүктелмеді." : "Черновик создан, но часть афиш не загрузилась."} ${uploadErrors.join(" ")}`);
      setSaving(false);
      return;
    }

    if (publish) {
      const { error: publishError } = await supabase.from("tournaments")
        .update({ status: "registration_open", is_public: true }).eq("id", tournament.id);
      if (publishError) {
        router.push(`/organizer/tournaments/${tournament.id}/settings`);
        return;
      }
    }
    router.push(`/organizer/tournaments/${tournament.id}`);
   }); }

  return <ActionScope pending={action.pending} error={action.error} paused={true}>{(
    <main className="container dashboard-page">
      <div className="page-topline"><a className="back-link" href="/organizer">{L("← Мои соревнования")}</a></div>
      <section className="form-card">
        <div className="eyebrow">{L("НОВОЕ СОРЕВНОВАНИЕ")}</div>
        <h1>{L("Создать соревнование")}</h1>
        <form className="tournament-form" onSubmit={submit}>
          <label>{L("\n            Название соревнования\n            ")}<input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          {([
            ["date", "Дата", "Күні"],
            ["city", "Город", "Қала"],
            ["venue", "Адрес", "Мекенжай"],
          ] as const).map(([key, ruLabel, kkLabel]) => <label key={key}>{locale === "ru" ? ruLabel : kkLabel}
            <input className="field" type={key === "date" ? "date" : "text"} value={details[key]}
              onChange={(event) => setDetails((current) => ({ ...current, [key]: event.target.value }))} />
          </label>)}
          <label>{locale === "ru" ? "Описание" : "Сипаттама"}
            <textarea className="field" value={details.description} onChange={(event) => setDetails((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label>{locale === "ru" ? "Текст положения" : "Ереже мәтіні"}
            <textarea className="field" value={details.regulations} onChange={(event) => setDetails((current) => ({ ...current, regulations: event.target.value }))} />
          </label>
          <TournamentSportFields value={sportSettings} onChange={setSportSettings} />

          <label>{L("Формат сеток по умолчанию\n            ")}<select className="field" value={bracketFormat} onChange={e => setBracketFormat(e.target.value as "single_elimination" | "round_robin")}>
              <option value="single_elimination">{L("Олимпийская")}</option>
              <option value="round_robin">{L("Круговая")}</option>
            </select>
          </label>
          <p className="muted">{L("Этот формат действует для всех категорий по умолчанию. При необходимости его можно изменить в карточке категории до начала боёв.")}</p>
          {bracketFormat === "single_elimination" && <label style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" checked={bronzeBout} onChange={e => setBronzeBout(e.target.checked)} />{L(" Проводить бой за 3-е место, если в категории есть два полуфиналиста\n          ")}</label>}

          <div>{L("\n            Афиши ")}<span className="muted">{L("(до 5 изображений)")}</span>
            <PosterFiles files={posters} onChange={setPosters} disabled={saving} />
          </div>

          {posters.length > 0 && (
            <div className="muted" aria-live="polite">{L("Выбрано афиш: ")}{posters.length}{L(" из 5")}</div>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <div className="button-row">
            <button className="secondary" type="submit" value="draft" disabled={saving}>{locale === "ru" ? "Сохранить черновик" : "Жобаны сақтау"}</button>
            <button className="primary" type="submit" value="publish" disabled={saving}>{locale === "ru" ? "Опубликовать и открыть регистрацию" : "Жариялап, тіркеуді ашу"}</button>
          </div>
        </form>
      </section>
    </main>
  )}</ActionScope>;
}

