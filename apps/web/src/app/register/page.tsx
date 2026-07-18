import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main>
      <h1>Créer un compte</h1>
      <RegisterForm />
      <p>
        Déjà un compte ? <Link href="/login">Connecte-toi</Link>
      </p>
      <p>
        <Link href="/lobby">Continuer en invité</Link>
      </p>
    </main>
  );
}
