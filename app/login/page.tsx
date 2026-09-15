"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/organizer";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Не удалось войти. Проверьте email и пароль.");
      setLoading(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand" href="/">TOURNAMENT PLATFORM</a>
        <div className="eyebrow">ОРГАНИЗАТОР</div>
        <h1>Вход</h1>
        <p className="muted">Войдите, чтобы управлять своими соревнованиями.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Пароль
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary full" disabled={loading}>
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>

        <a className="back-link" href="/">← Вернуться на главную</a>
      </section>
    </main>
  );
}
