import type { ReactNode } from "react";
import localFont from "next/font/local";
import { getCurrentUser } from "@/lib/session";
import { Header } from "@/components/Header";
import "./globals.css";

const baloo = localFont({
  src: "../fonts/Baloo2.ttf",
  variable: "--font-display",
  display: "swap",
});

const workSans = localFont({
  src: "../fonts/WorkSans.ttf",
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Personne n'a testé ce truc ?!",
  description: "Clone numérique du party game de cartes chaotique",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="fr" className={`${baloo.variable} ${workSans.variable}`}>
      <body>
        <Header user={user} />
        {children}
      </body>
    </html>
  );
}
