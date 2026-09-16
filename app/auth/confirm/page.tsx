"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function confirm() {
      const supabase = createClient();
      const code = searchParams.get("code");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (active) setError("Не удалось подтвердить email. Откройте ссылку из последнего письма ещё раз.");
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (active) setError("Сессия подтверждения не найдена. Откройте ссылку из последнего письма ещё раз.");
        return;
      }

      const user = session.user;
      const { data: organizer, error: organizerReadError } = await supabase
        .from("organizers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (organizerReadError) {
        if (active) setError("Email подтверждён, но не удалось загрузить профиль организатора.");
        return;
      }

      if (!organizer) {
        const { error: organizerCreateError } = await supabase.from("organizers").insert({
          user_id: user.id,
          display_name: user.user_metadata?.display_name || user.email || "Организатор",
          email: user.email?.toLowerCase() || null,
        });
        if (organizerCreateError && !organizerCreateError.message.toLowerCase().includes("duplicate")) {
          if (active) setError("Email подтверждён, но не удалось создать профиль организатора.");
          return;
        }
      }

      router.replace("/organizer");
      router.refresh();
    }

    void confirm();
    return () => { active = false; };
  }, [router, searchParams]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">TOURNAMENT PLATFORM</div>
        <h1>{error ? "Ошибка подтверждения" : "Подтверждаем email…"}</h1>
        <p className={error ? "error" : "muted"}>{error || "Подождите, открываем кабинет организатора."}</p>
        {error && <a className="button-link secondary" href="/login">Вернуться ко входу</a>}
      </section>
    </main>
  );
}
