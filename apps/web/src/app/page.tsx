import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main>
      <h1>Personne n&apos;a testé ce truc ?!</h1>
      <p>Party game de cartes chaotique et absurde.</p>

      {user ? (
        <p>
          Connecté en tant que <strong>{user.displayName}</strong> ({user.email}) — <LogoutButton />
        </p>
      ) : (
        <p>
          <Link href="/login">Se connecter</Link> ou <Link href="/register">créer un compte</Link> (optionnel, tu peux
          aussi jouer en invité).
        </p>
      )}

      <Link href="/lobby">Rejoindre une partie</Link>
    </main>
  );
}
