export type UserId = string;

/** Représentation publique d'un compte — jamais de hash de mot de passe ici. */
export type PublicUser = {
  id: UserId;
  email: string;
  displayName: string;
};
