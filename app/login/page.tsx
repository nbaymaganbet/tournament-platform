"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { translations, type Locale } from "@/lib/i18n";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/organizer";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<Locale>("ru");
  const t = translations[locale];

  useEffect(() => {
    const saved = localStorage.getItem("tp-lang");
    if (saved === "ru" || saved === "kk") setLocale(saved);
  }, []);

  function changeLang(nextLocale: Locale) {
    setLocale(nextLocale);
    localStorage.setItem("tp-lang", nextLocale);
    document.cookie = `tp-lang=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(t.loginError);
        setLoading(false);
        return;
      }

      router.replace(next);
      router.refresh();
    } catch {
      setError(t.loginError);
      setLoading(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-topbar">
        <a className="brand" href="/">TOURNAMENT PLATFORM</a>
        <button className="lang" type="button" onClick={() => changeLang(locale === "ru" ? "kk" : "ru")}>
          {locale === "ru" ? "ҚАЗ" : "РУС"}
        </button>
      </div>
      <div className="eyebrow">{t.organizer.toUpperCase()}</div>
      <h1>{t.loginTitle}</h1>
      <p className="muted">{t.loginText}</p>
      <form onSubmit={handleSubmit} className="auth-form">
        <label>{t.email}<input className="field" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>{t.password}<input className="field" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary full" disabled={loading}>{loading ? t.loggingIn : t.login}</button>
      </form>
      <a className="back-link" href="/">← {t.home}</a>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<section className="auth-card"><p className="muted">Загрузка…</p></section>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
