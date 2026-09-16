import { cookies } from "next/headers";
import { translations, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get("tp-lang")?.value;
  return value === "kk" ? "kk" : "ru";
}

export async function getT() {
  return translations[await getLocale()];
}
