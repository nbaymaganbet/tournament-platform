import { uiText } from "@/lib/ui-text";
import { getLocale } from "@/lib/i18n-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RegistrationForm from "./registration-form";

export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
 const locale = await getLocale();const L = (text: string) => uiText(locale, text);

  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id,name,status,is_public")
    .eq("id", id)
    .eq("is_public", true)
    .eq("status", "registration_open")
    .single();
  if (!tournament) notFound();

  return (
    <main className="container form-page">
      <div className="page-topline"><Link className="back-link" href={`/tournaments/${id}`}>← {tournament.name}</Link></div>
      <div className="form-card">
        <div className="eyebrow">{L("Регистрация участника")}</div>
        <h1>{L("Заявка на участие")}</h1>
        <p className="muted">{L("Заполните данные. После отправки вы получите номер заявки.")}</p>
        <RegistrationForm tournamentId={id} />
      </div>
    </main>
  );
}

