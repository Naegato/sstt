"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, registerAccount } from "@/lib/api";

const OAUTH_PROVIDERS = [
  { id: "discord", label: "Continuer avec Discord" },
  { id: "google", label: "Continuer avec Google" },
] as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerAccount(email, password, displayName);
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
          Nom affiché
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          Mot de passe (8 caractères min.)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="auth-form__error">{error}</p>}
        <button type="submit" disabled={submitting}>
          Créer mon compte
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
