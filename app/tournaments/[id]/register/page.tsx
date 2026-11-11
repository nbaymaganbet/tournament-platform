import { uiText } from "@/lib/ui-text";
import { getLocale } from "@/lib/i18n-server";
import Link from "@/components/pending-link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { availableDivisions } from "@/lib/tournament-divisions";
import RegistrationForm from "./registration-form";

export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
 const locale = await getLocale();const L = (text: string) => uiText(locale, text);

  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id,name,status,is_public,divisions")
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
        <p className="muted">{L("После подтверждения заявки организатором вы появитесь в списке участников.")}</p>
        <RegistrationForm tournamentId={id} divisions={availableDivisions(tournament.divisions)} />
      </div>
    </main>
  );
}

