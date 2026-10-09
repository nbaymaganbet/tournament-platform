import type { Metadata, Viewport } from "next";
import "./globals.css";
import LanguageToggle from "@/components/language-toggle";
import { LocaleProvider } from "@/components/locale-provider";
import { getLocale } from "@/lib/i18n-server";
import Onboarding from "@/components/onboarding";

export const metadata: Metadata = {
  title: "Tournament Platform",
  description: "Платформа для организации и проведения спортивных соревнований",
  appleWebApp: { capable: true, title: "Tournament", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body><LocaleProvider locale={locale}><LanguageToggle /><Onboarding />{children}</LocaleProvider></body>
    </html>
  );
}

