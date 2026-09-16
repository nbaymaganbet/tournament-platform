import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
  if (!storagePath) return NextResponse.json({ error: "storagePath is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: organizer } = await supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle();
  if (!organizer) return NextResponse.json({ error: "Organizer not found" }, { status: 403 });

  const { data: tournament } = await supabase.from("tournaments").select("id,organizer_id").eq("id", id).eq("organizer_id", organizer.id).maybeSingle();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  if (!storagePath.startsWith(`${organizer.id}/${id}/`)) {
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
  }

  const { data: file } = supabase.storage.from("regulations").getPublicUrl(storagePath);
  const response = await fetch(file.publicUrl, { cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: "Could not read uploaded PDF" }, { status: 422 });

  const buffer = Buffer.from(await response.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (!text) return NextResponse.json({ error: "PDF does not contain selectable text. Paste the regulation text into the text field." }, { status: 422 });

    const { error } = await supabase.from("tournaments").update({ regulations_text: text, updated_at: new Date().toISOString() }).eq("id", id).eq("organizer_id", organizer.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ text });
  } finally {
    await parser.destroy();
  }
}
