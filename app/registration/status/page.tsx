import { uiText } from "@/lib/ui-text";
import { getLocale } from "@/lib/i18n-server";
import StatusClient from "./status-client";

export default async function RegistrationStatusPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
 const locale = await getLocale();const L = (text: string) => uiText(locale, text);

  const params = await searchParams;
  return <main className="container public-page"><div className="page-topline"><a className="back-link" href="/">{L("← На главную")}</a></div><div className="section-header"><div><div className="eyebrow">{L("ЗАЯВКА")}</div><h1>{L("Статус заявки")}</h1><p className="muted">{L("Откройте защищённую ссылку из подтверждения регистрации или вставьте код доступа.")}</p></div></div><StatusClient initialToken={params.token ?? ""} /></main>;
}

