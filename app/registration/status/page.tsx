import StatusClient from "./status-client";

export default async function RegistrationStatusPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <main className="container public-page"><div className="page-topline"><a className="back-link" href="/">← На главную</a></div><div className="section-header"><div><div className="eyebrow">ЗАЯВКА</div><h1>Статус заявки</h1><p className="muted">Откройте защищённую ссылку из подтверждения регистрации или вставьте код доступа.</p></div></div><StatusClient initialToken={params.token ?? ""} /></main>;
}
