"use client";
import { uiText } from "@/lib/ui-text";
import { useLocale } from "@/components/locale-provider";


import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

export default function NewTournamentPage() {
 const locale = useLocale();const L = (text: string) => uiText(locale, text);

  const router = useRouter();
  const [name, setName] = useState("");
  const [bracketFormat, setBracketFormat] = useState<"single_elimination" | "round_robin">("single_elimination");
  const [bronzeBout, setBronzeBout] = useState(true);
  const [posters, setPosters] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function selectPosters(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    setPosters(files.slice(0, 5));
    if (files.length > 5) setError(L("Можно добавить максимум 5 афиш."));
    else setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      .insert({ organizer_id: organizer.id, name: name.trim(), slug, status: "draft", is_public: false, bracket_format: bracketFormat, bronze_bout: bracketFormat === "single_elimination" && bronzeBout })
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
      const safeName = poster.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${organizer.id}/${tournament.id}/${Date.now()}-${index}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("posters").upload(path, poster, {
        upsert: true,
        contentType: poster.type || undefined,
      });

      if (uploadError) {
        uploadErrors.push(`${L("Афиша ")}${index + 1}: ${uploadError.message}`);
        continue;
      }

      const { data: publicUrl } = supabase.storage.from("posters").getPublicUrl(path);
      posterRows.push({ tournament_id: tournament.id, storage_path: path, public_url: publicUrl.publicUrl, sort_order: index });
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

    router.push(`/organizer/tournaments/${tournament.id}`);
  }

  return (
    <main className="container dashboard-page">
      <div className="page-topline"><a className="back-link" href="/organizer">{L("← Мои соревнования")}</a></div>
      <section className="form-card">
        <div className="eyebrow">{L("НОВОЕ СОРЕВНОВАНИЕ")}</div>
        <h1>{L("Создать соревнование")}</h1>
        <p className="muted">{L("На первом шаге достаточно названия и афиш. Дату, город, вид спорта, положение и остальные настройки добавите внутри турнира.")}</p>
        <form className="tournament-form" onSubmit={submit}>
          <label>{L("\n            Название соревнования\n            ")}<input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          <label>{L("Формат сеток по умолчанию\n            ")}<select className="field" value={bracketFormat} onChange={e => setBracketFormat(e.target.value as "single_elimination" | "round_robin")}>
              <option value="single_elimination">{L("Олимпийская")}</option>
              <option value="round_robin">{L("Круговая")}</option>
            </select>
          </label>
          <p className="muted">{L("Этот формат действует для всех категорий по умолчанию. При необходимости его можно изменить в карточке категории до начала боёв.")}</p>
          {bracketFormat === "single_elimination" && <label style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" checked={bronzeBout} onChange={e => setBronzeBout(e.target.checked)} />{L(" Проводить бой за 3-е место, если в категории есть два полуфиналиста\n          ")}</label>}

          <label>{L("\n            Афиши ")}<span className="muted">{L("(до 5 изображений)")}</span>
            <input className="field" type="file" accept="image/*" multiple onChange={selectPosters} />
          </label>

          {posters.length > 0 && (
            <div className="muted" aria-live="polite">{L("Выбрано афиш: ")}{posters.length}{L(" из 5")}</div>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={saving}>{saving ? L("Создаём…") : L("Создать соревнование")}</button>
        </form>
      </section>
    </main>
  );
}

