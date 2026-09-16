"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/gi, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

export default function NewTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [posters, setPosters] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function selectPosters(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    setPosters(files.slice(0, 5));
    if (files.length > 5) setError("Можно добавить максимум 5 афиш.");
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
      setError("Введите название соревнования.");
      setSaving(false);
      return;
    }
    if (posters.length > 5) {
      setError("Можно добавить максимум 5 афиш.");
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
        setError(organizerError?.message ?? "Не удалось создать профиль организатора.");
        setSaving(false);
        return;
      }
      organizer = createdOrganizer;
    }

    const slug = `${slugify(name) || "tournament"}-${Date.now().toString().slice(-6)}`;
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({ organizer_id: organizer.id, name: name.trim(), slug, status: "draft", is_public: false })
      .select("id")
      .single();

    if (tournamentError || !tournament) {
      setError(tournamentError?.message ?? "Не удалось создать соревнование.");
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
        uploadErrors.push(`Афиша ${index + 1}: ${uploadError.message}`);
        continue;
      }

      const { data: publicUrl } = supabase.storage.from("posters").getPublicUrl(path);
      posterRows.push({ tournament_id: tournament.id, storage_path: path, public_url: publicUrl.publicUrl, sort_order: index });
    }

    if (posterRows.length) {
      const { error: postersError } = await supabase.from("tournament_posters").insert(posterRows);
      if (postersError) uploadErrors.push(`Афиши: ${postersError.message}`);

      const firstPoster = posterRows[0];
      await supabase.from("tournaments").update({ poster_url: firstPoster.public_url }).eq("id", tournament.id);
    }

    if (uploadErrors.length) {
      setError(`Черновик создан, но часть афиш не загрузилась. ${uploadErrors.join(" ")}`);
      setSaving(false);
      return;
    }

    router.push(`/organizer/tournaments/${tournament.id}`);
  }

  return (
    <main className="container dashboard-page">
      <div className="page-topline"><a className="back-link" href="/organizer">← Мои соревнования</a></div>
      <section className="form-card">
        <div className="eyebrow">НОВОЕ СОРЕВНОВАНИЕ</div>
        <h1>Создать соревнование</h1>
        <p className="muted">На первом шаге достаточно названия и афиш. Дату, город, вид спорта, положение и остальные настройки добавите внутри турнира.</p>
        <form className="tournament-form" onSubmit={submit}>
          <label>
            Название соревнования
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          <label>
            Афиши <span className="muted">(до 5 изображений)</span>
            <input className="field" type="file" accept="image/*" multiple onChange={selectPosters} />
          </label>

          {posters.length > 0 && (
            <div className="muted" aria-live="polite">Выбрано афиш: {posters.length} из 5</div>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary" disabled={saving}>{saving ? "Создаём…" : "Создать соревнование"}</button>
        </form>
      </section>
    </main>
  );
}
