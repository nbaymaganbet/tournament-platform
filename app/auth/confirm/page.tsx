"use client";
import { uiText } from "@/lib/ui-text";
import { useLocale } from "@/components/locale-provider";


import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AuthConfirmContent() {
 const locale = useLocale();const L = (text: string) => uiText(locale, text);

  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function confirm() {
      const supabase = createClient();
      // getSession waits for the browser client to finish processing the email link.
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
  }, [router]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">TOURNAMENT PLATFORM</div>
        <h1>{error ? L("Ошибка подтверждения") : L("Подтверждаем email…")}</h1>
        <p className={error ? "error" : "muted"}>{error ? L(error) : L("Подождите, открываем кабинет организатора.")}</p>
        {error && <a className="button-link secondary" href="/login">{L("Вернуться ко входу")}</a>}
      </section>
    </main>
  );
}

export default function AuthConfirmPage() {
 const locale = useLocale();const L = (text: string) => uiText(locale, text);

  return (
    <Suspense fallback={
      <main className="auth-page">
        <section className="auth-card">
          <div className="eyebrow">TOURNAMENT PLATFORM</div>
          <h1>{L("Подтверждаем email…")}</h1>
          <p className="muted">{L("Подождите, открываем кабинет организатора.")}</p>
        </section>
      </main>
    }>
      <AuthConfirmContent />
    </Suspense>
  );
}

