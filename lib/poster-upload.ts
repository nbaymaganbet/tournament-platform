import type { SupabaseClient } from "@supabase/supabase-js";

// The stored path always points to the untouched original. public_url may point
// to its smaller display copy, so existing posters need no data migration.
export function posterStoragePaths(poster: { storage_path: string; public_url: string }) {
  const preview = `${poster.storage_path}.preview.webp`;
  return poster.public_url.endsWith(encodeURI(preview)) || poster.public_url.endsWith(preview)
    ? [poster.storage_path, preview] : [poster.storage_path];
}

export async function compressPoster(file: File): Promise<Blob> {
  // Preserve animated formats and vector images as uploaded.
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.92));
    return compressed?.type === "image/webp" && compressed.size < file.size ? compressed : file;
  } catch {
    // An unsupported decoder must never prevent uploading the original.
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadPoster(client: SupabaseClient, file: File, organizerId: string, tournamentId: string) {
  const display = await compressPoster(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${organizerId}/${tournamentId}/${crypto.randomUUID()}-${safeName}`;
  const bucket = client.storage.from("posters");
  const { error } = await bucket.upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  let displayPath = path;
  if (display !== file) {
    const previewPath = `${path}.preview.webp`;
    const { error: previewError } = await bucket.upload(previewPath, display, { upsert: false, contentType: "image/webp" });
    // Keep the usable original even if the optional display copy cannot upload.
    if (!previewError) displayPath = previewPath;
  }
  return { storage_path: path, public_url: bucket.getPublicUrl(displayPath).data.publicUrl };
}
