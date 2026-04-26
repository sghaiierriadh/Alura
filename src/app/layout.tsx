import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/app/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Titres par page : exporter `metadata` depuis chaque `page.tsx` / `layout.tsx`
 * segment avec au minimum `title: "Nom de la page"` — le template ajoute « | Alura ».
 * Exemple dashboard : `export const metadata = { title: "Tableau de bord" };` → « Tableau de bord | Alura ».
 */
export const metadata: Metadata = {
  title: {
    default: "Alura | Votre Assistant IA Clientèle",
    template: "%s | Alura",
  },
  description:
    "Automatisez votre support client avec l'IA de Pixelynks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
