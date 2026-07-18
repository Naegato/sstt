import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main>
      <h1>Connexion</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p>
        Pas de compte ? <Link href="/register">Inscris-toi</Link>
      </p>
      <p>
        <Link href="/lobby">Continuer en invité</Link>
      </p>
    </main>
  );
}
