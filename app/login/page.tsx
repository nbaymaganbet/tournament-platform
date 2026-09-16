"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError || !data.user) {
        setError(signInError?.message || t.loginError);
        setLoading(false);
        return;
      }

      // The organizer dashboard is the single source of truth for the profile.
      // It creates the organizer row if this is a valid Auth user whose profile
      // has not been created yet, so login never fails with a false profile error.
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loginError);
      setLoading(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-topbar">
        <a className="brand" href="/">TOURNAMENT PLATFORM</a>
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
      <div className="auth-secondary"><span className="muted">{locale === "ru" ? "Нет аккаунта?" : "Аккаунт жоқ па?"}</span><Link className="button-link secondary" href="/organizer/register">{locale === "ru" ? "Регистрация организатора" : "Ұйымдастырушы ретінде тіркелу"}</Link></div>
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
