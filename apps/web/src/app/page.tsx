import Link from "next/link";

export default function HomePage() {
  return (
    <main className="centered-page">
      <div className="logo-sticker">
        <span className="logo-sticker__mark">🃏</span>
        Personne n&apos;a testé ce truc&nbsp;?!
      </div>

      <p className="home-tagline">Party game de cartes chaotique et absurde. Aucun équilibrage. Zéro pitié.</p>
      <p className="home-cta__secondary">
        <span>Un compte est optionnel, tu peux aussi jouer en invité.</span>
      </p>

      <div className="home-cta">
        <Link href="/lobby" className="btn-sticker">
          🎲 Rejoindre une partie
        </Link>
      </div>
    </main>
  );
}
