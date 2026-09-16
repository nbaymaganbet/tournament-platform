"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Locale = "ru" | "kk";

export default function OrganizerRegisterPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("ru");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("tp-lang");
    if (saved === "kk") setLocale("kk");
  }, []);

  const ru = locale === "ru";
  const tr = {
    title: ru ? "Регистрация организатора" : "Ұйымдастырушыны тіркеу",
    text: ru ? "Создайте аккаунт. После регистрации турниры будут сохраняться в вашем кабинете." : "Аккаунт жасаңыз. Тіркелгеннен кейін жарыстарыңыз кабинетте сақталады.",
    name: ru ? "Имя или название организации" : "Аты немесе ұйым атауы",
    email: "Email",
    password: ru ? "Пароль" : "Құпиясөз",
    confirm: ru ? "Повторите пароль" : "Құпиясөзді қайталаңыз",
    button: ru ? "Создать аккаунт" : "Аккаунт жасау",
    loading: ru ? "Создаём…" : "Жасалуда…",
    have: ru ? "Уже есть аккаунт?" : "Аккаунт бар ма?",
    login: ru ? "Войти" : "Кіру",
    required: ru ? "Заполните все поля." : "Барлық өрісті толтырыңыз.",
    mismatch: ru ? "Пароли не совпадают." : "Құпиясөздер сәйкес емес.",
    weak: ru ? "Пароль должен содержать минимум 6 символов." : "Құпиясөз кемінде 6 таңбадан тұруы керек.",
    failed: ru ? "Не удалось создать аккаунт." : "Аккаунтты жасау мүмкін болмады.",
    timeout: ru ? "Сервер не ответил вовремя. Проверьте подключение и попробуйте ещё раз." : "Сервер уақытында жауап бермеді. Қосылымды тексеріп, қайта көріңіз.",
    check: ru ? "Аккаунт создан. Проверьте почту и подтвердите email, затем войдите." : "Аккаунт жасалды. Email-ді тексеріп, растаңыз, содан кейін кіріңіз.",
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!displayName.trim() || !email.trim() || !password) return setError(tr.required);
    if (password.length < 6) return setError(tr.weak);
    if (password !== confirmPassword) return setError(tr.mismatch);
    setSaving(true);

    try {
      const supabase = createClient();
      const emailRedirectTo = `${window.location.origin}/auth/confirm`;
      const result = await Promise.race([
        supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo,
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 15000)),
      ]);

      const { data, error: signUpError } = result;
      if (signUpError) {
        setError(signUpError.message || tr.failed);
        setSaving(false);
        return;
      }
      if (!data.user) {
        setError(tr.failed);
        setSaving(false);
        return;
      }

      if (!data.session) {
        setMessage(tr.check);
        setSaving(false);
        return;
      }

      router.replace("/organizer");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message === "TIMEOUT" ? tr.timeout : (e instanceof Error ? e.message : tr.failed));
      setSaving(false);
    }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-topbar"><Link className="brand" href="/">TOURNAMENT PLATFORM</Link><button className="lang" type="button" onClick={() => { const next = ru ? "kk" : "ru"; setLocale(next); localStorage.setItem("tp-lang", next); document.cookie = `tp-lang=${next}; path=/; max-age=31536000; samesite=lax`; }}>{ru ? "ҚАЗ" : "РУС"}</button></div>
    <div className="eyebrow">{ru ? "ОРГАНИЗАТОР" : "ҰЙЫМДАСТЫРУШЫ"}</div><h1>{tr.title}</h1><p className="muted">{tr.text}</p>
    <form onSubmit={submit} className="auth-form">
      <label>{tr.name}<input className="field" value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" required /></label>
      <label>{tr.email}<input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
      <label>{tr.password}<input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /></label>
      <label>{tr.confirm}<input className="field" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required /></label>
      {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
      <button className="primary full" disabled={saving}>{saving ? tr.loading : tr.button}</button>
    </form>
    <p className="muted">{tr.have} <Link href="/login">{tr.login}</Link></p>
  </section></main>;
}
