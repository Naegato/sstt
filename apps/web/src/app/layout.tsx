import type { ReactNode } from "react";

export const metadata = {
  title: "Personne n'a testé ce truc ?!",
  description: "Clone numérique du party game de cartes chaotique",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
