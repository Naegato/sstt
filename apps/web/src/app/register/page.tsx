import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="centered-page">
      <div className="sticker-page-card">
        <h1>Créer un compte</h1>
        <RegisterForm />
        <div className="sticker-page-links">
          <p>
            Déjà un compte ? <Link href="/login">Connecte-toi</Link>
          </p>
          <p>
            <Link href="/lobby">Continuer en invité</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
