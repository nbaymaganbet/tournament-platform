import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LegacyAflPage() {
  const supabase = await createClient();
  const { data: tournament } = await supabase.from("tournaments").select("id").eq("slug", "afl-club-open").maybeSingle();
  if (tournament?.id) redirect(`/tournaments/${tournament.id}`);
  redirect("/");
}
