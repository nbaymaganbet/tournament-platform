import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ParticipantsClient from "./participants-client";

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
  if (!organizer) notFound();

  const { data: tournament } = await supabase.from("tournaments").select("id,name").eq("id", id).eq("organizer_id", organizer.id).single();
  if (!tournament) notFound();

  const { data: registrations, error } = await supabase
    .from("registrations")
    .select("id,participant_id,application_number,status,payment_status,participants(first_name,last_name,age,weight,actual_weight,experience,phone,club,coach)")
    .eq("tournament_id", id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (registrations ?? []).flatMap((r) => {
    const p = Array.isArray(r.participants) ? r.participants[0] : r.participants;
    return p ? [{ id: r.id, participant_id: r.participant_id, application_number: r.application_number, status: r.status, payment_status: r.payment_status, ...p }] : [];
  });

  return (
    <main className="container dashboard-page">
      <div className="page-topline"><Link className="back-link" href={`/organizer/tournaments/${id}`}>← {tournament.name}</Link></div>
      <header className="section-header"><div><div className="eyebrow">Управление</div><h1>Участники</h1><p className="muted">Заявки, оплата, подтверждение и официальный вес на взвешивании.</p></div><strong>{rows.length}</strong></header>
      <ParticipantsClient tournamentId={id} initialRows={rows} />
    </main>
  );
}
