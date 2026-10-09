import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import type { Result } from "../page";
import { resultPreviewFontBase64 } from "@/lib/result-preview-font";

export const alt = "Афиша турнира и результаты категории";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string; categoryId: string }> }) {
  try {
  const { id, categoryId } = await params;
  const s = await createClient();
  const { data: tournament } = await s.from("tournaments").select("name,poster_url").eq("id", id).eq("is_public", true).eq("status", "completed").maybeSingle();
  if (!tournament) return new Response("Not found", { status: 404 });
  const { data, error } = await s.rpc("get_public_tournament_results_detailed", { p_tournament_id: id });
  if (error) return new Response("Unavailable", { status: 503 });
  const rows = ((data ?? []) as Result[]).filter(r => r.category_id === categoryId);
  if (!rows.length) return new Response("Not found", { status: 404 });
  const font = Buffer.from(resultPreviewFontBase64, "base64");
  const image = new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", background: "#0b0b0e", color: "white", fontFamily: "Geist" }}>
    {tournament.poster_url && <img src={tournament.poster_url} width={420} height={630} style={{ objectFit: "contain", background: "#111" }} alt="" />}
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "45px", width: tournament.poster_url ? 780 : 1200 }}>
      <div style={{ color: "#ff625d", fontSize: 25, marginBottom: 16 }}>{tournament.name}</div>
      <div style={{ fontSize: 36, marginBottom: 28 }}>{rows[0].category_name}</div>
      {rows.slice(0, 5).map(r => <div key={`${r.place}:${r.athlete_name}`} style={{ display: "flex", fontSize: 27, marginBottom: 13 }}>{r.place}. {r.athlete_name}</div>)}
      {rows.length > 5 && <div style={{ display: "flex", fontSize: 19, color: "#aaa" }}>+{rows.length - 5} · Полные результаты по ссылке</div>}
    </div>
  </div>, { ...size, fonts: [{ name: "Geist", data: font, weight: 400, style: "normal" }] });
  const bytes = await image.arrayBuffer();
  return new Response(bytes, { headers: { "Content-Type": "image/png" } });
  } catch (error) { console.error("Category result preview failed", error); return new Response("Image unavailable", { status: 500 }); }
}
