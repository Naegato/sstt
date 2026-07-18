"use client";

import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, login } from "@/lib/api";

const OAUTH_PROVIDERS = [
  { id: "discord", label: "Continuer avec Discord" },
  { id: "google", label: "Continuer avec Google" },
] as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-form">
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {(error || oauthError) && <p className="auth-form__error">{error ?? "Connexion OAuth échouée."}</p>}
        <button type="submit" disabled={submitting}>
          Se connecter
        </button>
      </form>

      <div className="auth-form__oauth">
        {OAUTH_PROVIDERS.map((provider) => (
          <a key={provider.id} href={`${API_URL}/api/auth/${provider.id}`}>
            {provider.label}
          </a>
        ))}
      </div>
    </div>
  );
}
