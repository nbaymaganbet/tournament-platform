import type { Metadata, Viewport } from "next";
import "./globals.css";
import LanguageToggle from "@/components/language-toggle";
import Onboarding from "@/components/onboarding";

export const metadata: Metadata = {
  title: "Tournament Platform",
  description: "Платформа для организации и проведения спортивных соревнований",
  appleWebApp: { capable: true, title: "Tournament", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><LanguageToggle /><Onboarding />{children}</body>
    </html>
  );
}
