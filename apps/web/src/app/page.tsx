import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="centered-page">
      <div className="logo-sticker">
        <span className="logo-sticker__mark">🃏</span>
        Personne n&apos;a testé ce truc&nbsp;?!
      </div>

      <p className="home-tagline">Party game de cartes chaotique et absurde. Aucun équilibrage. Zéro pitié.</p>

      {user ? (
        <p className="home-identity">
          Connecté en tant que <strong>{user.displayName}</strong> ({user.email})
          <LogoutButton />
        </p>
      ) : (
        <p className="home-cta__secondary">
          <Link href="/login">Se connecter</Link>
          <span>·</span>
          <Link href="/register">créer un compte</Link>
          <span>(optionnel, tu peux aussi jouer en invité)</span>
        </p>
      )}

      <div className="home-cta">
        <Link href="/lobby" className="btn-sticker">
          🎲 Rejoindre une partie
        </Link>
      </div>
    </main>
  );
}
