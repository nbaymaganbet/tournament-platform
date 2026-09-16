import type { Metadata } from "next";
import "./globals.css";
import LanguageToggle from "@/components/language-toggle";

export const metadata: Metadata = {
  title: "Tournament Platform",
  description: "Платформа для организации и проведения спортивных соревнований",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><LanguageToggle />{children}</body>
    </html>
  );
}
