"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const ru = useLocale() === "ru";
  const [access, setAccess] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      if (query.has("error") || query.has("error_code") || fragment.has("error") || fragment.has("error_code")) {
        if (active) setAccess("invalid");
        return;
      }
      try {
        // The browser client consumes the email's PKCE code (or recovery hash)
        // during initialization. getUser waits for it and validates the user.
        const { data: { user }, error: sessionError } = await createClient().auth.getUser();
        if (active) setAccess(!sessionError && user ? "ready" : "invalid");
      } catch {
        if (active) setAccess("invalid");
      }
    }
    void checkSession();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || access !== "ready") return;
    setError("");
    if (password.length < 8) {
      setError(ru ? "Пароль должен содержать не менее 8 символов." : "Құпиясөз кемінде 8 таңбадан тұруы керек.");
      return;
    }
    if (password !== confirmation) {
      setError(ru ? "Пароли не совпадают." : "Құпиясөздер сәйкес келмейді.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) {
        if (updateError.status === 401 || updateError.status === 403 || updateError.code === "session_not_found") {
          setAccess("invalid");
        } else {
          setError(ru ? "Не удалось сохранить пароль. Используйте новый пароль не короче 8 символов и попробуйте снова." : "Құпиясөзді сақтау мүмкін болмады. Кемінде 8 таңбадан тұратын жаңа құпиясөзбен қайталап көріңіз.");
        }
        return;
      }
      setPassword("");
      setConfirmation("");
      setSaved(true);
    } catch {
      setError(ru ? "Не удалось сохранить пароль. Проверьте подключение и попробуйте снова." : "Құпиясөзді сақтау мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-topbar"><Link className="brand" href="/">TOURNAMENT PLATFORM</Link></div>
    <h1>{ru ? "Новый пароль" : "Жаңа құпиясөз"}</h1>
    {access === "checking" ? <p className="muted" role="status">{ru ? "Проверяем ссылку…" : "Сілтеме тексерілуде…"}</p>
      : access === "invalid" ? <>
        <p className="error" role="alert">{ru ? "Ссылка недействительна или срок её действия истёк. Запросите новое письмо и откройте его в том же браузере, где отправляли запрос." : "Сілтеме жарамсыз немесе мерзімі аяқталған. Жаңа хат сұратып, оны сұрау жіберген браузерде ашыңыз."}</p>
        <Link className="button-link secondary" href="/forgot-password">{ru ? "Запросить новую ссылку" : "Жаңа сілтеме сұрату"}</Link>
      </> : saved ? <>
        <p className="success" role="status">{ru ? "Пароль изменён. Теперь можно входить с новым паролем." : "Құпиясөз өзгертілді. Енді жаңа құпиясөзбен кіре аласыз."}</p>
        <Link className="button-link primary" href="/organizer">{ru ? "Открыть кабинет" : "Жеке кабинетке өту"}</Link>
      </> : <>
        <p className="muted">{ru ? "Введите новый пароль — не менее 8 символов." : "Жаңа құпиясөзді енгізіңіз — кемінде 8 таңба."}</p>
        <form className="auth-form" onSubmit={submit}>
          <label>{ru ? "Новый пароль" : "Жаңа құпиясөз"}<input className="field" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/></label>
          <label>{ru ? "Повторите пароль" : "Құпиясөзді қайталаңыз"}<input className="field" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}/></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary full" disabled={busy}>{busy ? (ru ? "Сохраняем…" : "Сақталуда…") : (ru ? "Сохранить пароль" : "Құпиясөзді сақтау")}</button>
        </form>
      </>}
    <div className="auth-secondary"><Link className="back-link" href="/login">{ru ? "← Вернуться ко входу" : "← Кіруге оралу"}</Link></div>
  </section></main>;
}
