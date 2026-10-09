import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n-server";
import type { Result } from "../page";
import { resultPreviewFontBase64 } from "@/lib/result-preview-font";

export const alt = "Результаты категории с медалями, возрастом, клубом и тренером";
export const contentType = "image/png";

function lines(value: string, limit: number) {
  const output: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
    if (line && line.length + word.length + 1 > limit) { output.push(line); line = ""; }
    const pieces = word.match(new RegExp(`.{1,${limit}}`, "gu")) ?? [];
    for (let i = 0; i < pieces.length; i++) {
      if (i > 0) { output.push(line); line = ""; }
      line += `${line ? " " : ""}${pieces[i]}`;
    }
  }
  if (line) output.push(line);
  return output;
}

function medal(place: number) {
  const color = place === 1 ? "#f3c543" : place === 2 ? "#c7cdd5" : "#cf8758";
  const numeral = place === 1 ? "M26 42l9-6v27M26 63h18" : place === 2 ? "M22 42c0-12 22-12 22 0 0 8-18 12-22 21h23" : "M22 39c7-8 24-5 21 5-1 4-5 6-10 6 7 0 12 4 11 9-2 10-18 11-23 3";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80"><path d="M12 0h14l17 33-13 7z" fill="#79b9ee"/><path d="M38 0h14L34 40l-13-7z" fill="#e84b46"/><circle cx="32" cy="50" r="27" fill="${color}"/><circle cx="32" cy="50" r="22" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="2"/><path d="${numeral}" fill="none" stroke="#654a25" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export default async function Image({ params }: { params: Promise<{ id: string; categoryId: string }> }) {
  try {
    const { id, categoryId } = await params;
    const s = await createClient();
    const kk = (await getLocale()) === "kk";
    const { data: tournament } = await s.from("tournaments").select("name").eq("id", id).eq("is_public", true).eq("status", "completed").maybeSingle();
    if (!tournament) return new Response("Not found", { status: 404 });
    const { data, error } = await s.rpc("get_public_tournament_results_detailed", { p_tournament_id: id });
    if (error) return new Response("Unavailable", { status: 503 });
    const rows = ((data ?? []) as Result[]).filter(r => r.category_id === categoryId);
    if (!rows.length) return new Response("Not found", { status: 404 });
    const tournamentLines = lines(tournament.name, 50);
    const categoryLines = lines(rows[0].category_name, 36);
    const cards = rows.map(row => {
      const name = lines(row.athlete_name || (kk ? "Қатысушы" : "Участник"), 35);
      const detail = lines(`${row.age ?? "—"} ${kk ? "жас" : "лет"} · ${row.club || (kk ? "Клуб көрсетілмеген" : "Клуб не указан")} · ${row.coach || (kk ? "Жаттықтырушы көрсетілмеген" : "Тренер не указан")}`, 47);
      return { row, name, detail, height: 64 + name.length * 52 + detail.length * 42 };
    });
    const height = 152 + tournamentLines.length * 42 + categoryLines.length * 58 + cards.reduce((sum, card) => sum + card.height + 16, 0);
    const image = new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 48, background: "#111317", color: "#f5f5f5", fontFamily: "Geist" }}>
      {tournamentLines.map((line, i) => <div key={`t:${i}`} style={{ display: "flex", fontSize: 32, lineHeight: "42px", color: "#8e949f" }}>{line}</div>)}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 20, marginBottom: 32 }}>
        {categoryLines.map((line, i) => <div key={`c:${i}`} style={{ display: "flex", fontSize: 44, lineHeight: "58px", color: "#e84b46" }}>{line}</div>)}
      </div>
      {cards.map(({ row, name, detail, height: cardHeight }, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", padding: 30, height: cardHeight, flexShrink: 0, marginBottom: 16, background: "#17191e", border: "2px solid #292d34", borderRadius: 24 }}>
        <div style={{ display: "flex", width: 76, flexShrink: 0, marginRight: 20 }}>
          {row.place <= 3 ? <img src={medal(row.place)} width={64} height={80} alt="" /> : <div style={{ display: "flex", fontSize: 40 }}>{row.place}.</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {name.map((line, j) => <div key={`n:${j}`} style={{ display: "flex", fontSize: 40, lineHeight: "52px" }}>{line}</div>)}
          {detail.map((line, j) => <div key={`d:${j}`} style={{ display: "flex", fontSize: 30, lineHeight: "42px", color: "#8e949f" }}>{line}</div>)}
        </div>
      </div>)}
    </div>, { width: 1200, height, fonts: [{ name: "Geist", data: Buffer.from(resultPreviewFontBase64, "base64"), weight: 400, style: "normal" }] });
    return new Response(await image.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Category result preview failed", error);
    return new Response("Image unavailable", { status: 500 });
  }
}
