"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, login } from "@/lib/api";
import { type LoginInput, loginSchema } from "@/lib/schemas";

const OAUTH_PROVIDERS = [
  { id: "discord", label: "Continuer avec Discord" },
  { id: "google", label: "Continuer avec Google" },
] as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      router.push("/");
      router.refresh();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Erreur inconnue");
    }
  };

  return (
    <div className="sticker-form-card">
      <form onSubmit={handleSubmit(onSubmit)} className="sticker-form">
        <label className="sticker-form__field">
          <span>Email</span>
          <input className="input-sticker" type="email" {...register("email")} />
          {errors.email && <span className="sticker-form__error">{errors.email.message}</span>}
        </label>
        <label className="sticker-form__field">
          <span>Mot de passe</span>
          <input className="input-sticker" type="password" {...register("password")} />
          {errors.password && <span className="sticker-form__error">{errors.password.message}</span>}
        </label>
        {(serverError || oauthError) && (
          <p className="sticker-form__error sticker-form__error--banner">
            {serverError ?? "Connexion OAuth échouée."}
          </p>
        )}
        <button type="submit" className="btn-sticker" disabled={isSubmitting}>
          Se connecter
        </button>
      </form>

      <div className="sticker-form__oauth">
        {OAUTH_PROVIDERS.map((provider) => (
          <a key={provider.id} className="btn-sticker btn-sticker--zone" href={`${API_URL}/api/auth/${provider.id}`}>
            {provider.label}
          </a>
        ))}
      </div>
    </div>
  );
}
