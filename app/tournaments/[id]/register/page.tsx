import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RegistrationForm from "./registration-form";

export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
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
        <div className="eyebrow">Регистрация участника</div>
        <h1>Заявка на участие</h1>
        <p className="muted">Заполните данные. После отправки вы получите номер заявки.</p>
        <RegistrationForm tournamentId={id} />
      </div>
    </main>
  );
}
