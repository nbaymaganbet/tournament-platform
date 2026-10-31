"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const ru = useLocale() === "ru";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: requestError } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (requestError) {
        setError(requestError.status === 429
          ? (ru ? "Слишком много запросов. Подождите немного и попробуйте снова." : "Сұрау тым көп. Біраз күтіп, қайталап көріңіз.")
          : (ru ? "Не удалось отправить письмо. Попробуйте ещё раз." : "Хатты жіберу мүмкін болмады. Қайталап көріңіз."));
        return;
      }
      setSent(true);
    } catch {
      setError(ru ? "Не удалось отправить письмо. Проверьте подключение и попробуйте снова." : "Хатты жіберу мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="container form-page"><section className="form-card">
    <div className="auth-topbar"><Link className="brand" href="/">TOURNAMENT PLATFORM</Link></div>
    <h1>{ru ? "Восстановить пароль" : "Құпиясөзді қалпына келтіру"}</h1>
    {sent ? <div role="status">
      <p className="success">{ru ? "Если аккаунт с этой почтой существует, на неё придёт ссылка для восстановления пароля." : "Осы поштамен аккаунт тіркелген болса, құпиясөзді қалпына келтіру сілтемесі жіберіледі."}</p>
      <p className="muted">{ru ? "Проверьте входящие и папку «Спам». Откройте ссылку на этом устройстве в том же браузере." : "Кіріс хаттар мен «Спам» қалтасын тексеріңіз. Сілтемені осы құрылғыда, сол браузерде ашыңыз."}</p>
    </div> : <>
      <p className="muted">{ru ? "Введите почту, которую указали при регистрации организатора." : "Ұйымдастырушы ретінде тіркелген кезде көрсеткен поштаңызды енгізіңіз."}</p>
      <form className="auth-form" onSubmit={submit}>
        <label>Email<input className="field" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy}/></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary full" disabled={busy}>{busy ? (ru ? "Отправляем…" : "Жіберілуде…") : (ru ? "Отправить ссылку" : "Сілтемені жіберу")}</button>
      </form>
    </>}
    <div className="auth-secondary"><Link className="back-link" href="/login">{ru ? "← Вернуться ко входу" : "← Кіруге оралу"}</Link></div>
  </section></main>;
}
