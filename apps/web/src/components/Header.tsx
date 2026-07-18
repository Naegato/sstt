import Link from "next/link";
import type { PublicUser } from "@card-game/shared-types";
import { CardCatalogButton } from "./CardCatalogButton";
import { LogoutButton } from "./auth/LogoutButton";

type HeaderProps = {
  user: PublicUser | null;
};

/**
 * En-tête commune à toutes les pages (accueil, lobby, jeu, login, register) —
 * un seul endroit pour le lien "Toutes les cartes" et le statut du compte,
 * plutôt qu'un bouton dupliqué par page (voir CLAUDE.md).
 */
export function Header({ user }: HeaderProps) {
  return (
    <header className="site-header">
      <Link href="/" className="site-header__brand">
        🃏 Personne n&apos;a testé ce truc&nbsp;?!
      </Link>

      <div className="site-header__actions">
        <CardCatalogButton />
        {user ? (
          <div className="site-header__account">
            <span>
              Bonjour, <strong>{user.firstName ?? user.displayName}</strong>
            </span>
            <LogoutButton />
          </div>
        ) : (
          <div className="site-header__account">
            <Link href="/login">Se connecter</Link>
            <Link href="/register">Créer un compte</Link>
          </div>
        )}
      </div>
    </header>
  );
}
