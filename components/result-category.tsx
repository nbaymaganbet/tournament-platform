import ResultShareButton from "@/components/result-share-button";
import type { Locale } from "@/lib/i18n";

export type ResultAthlete = {
  id: string;
  place: number;
  name: string;
  age: number | null;
  club: string | null;
  coach: string | null;
};

export default function ResultCategory({ tournamentId, tournamentName, categoryId, categoryName, athletes, locale = "ru", share = true }: {
  tournamentId: string; tournamentName: string; categoryId: string; categoryName: string;
  athletes: ResultAthlete[]; locale?: Locale; share?: boolean;
}) {
  const kk = locale === "kk";
  return <section className="form-card result-category">
    <div className="result-category-heading">
      <h2 className="eyebrow">{categoryName}</h2>
      {share && <ResultShareButton key={locale} tournamentName={tournamentName} categoryName={categoryName} athletes={athletes} locale={locale} url={`/tournaments/${tournamentId}/results/${categoryId}`} />}
    </div>
    <div className="participants-list">
      {athletes.map(a => <article className="participant-card" key={a.id}>
        <div className="participant-main">
          <strong>{a.place === 1 ? "🥇" : a.place === 2 ? "🥈" : a.place === 3 ? "🥉" : `${a.place}.`} {a.name || (kk ? "Қатысушы" : "Участник")}</strong>
          <span className="muted">{a.age ?? "—"} {kk ? "жас" : "лет"} · {a.club || (kk ? "Клуб көрсетілмеген" : "Клуб не указан")} · {a.coach || (kk ? "Жаттықтырушы көрсетілмеген" : "Тренер не указан")}</span>
        </div>
      </article>)}
    </div>
  </section>;
}
