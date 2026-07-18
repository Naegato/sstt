"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, registerAccount } from "@/lib/api";
import { type RegisterInput, registerSchema } from "@/lib/schemas";

const OAUTH_PROVIDERS = [
  { id: "discord", label: "Continuer avec Discord" },
  { id: "google", label: "Continuer avec Google" },
] as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", firstName: "", lastName: "", displayName: "", password: "" },
  });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);
    try {
      await registerAccount(data.email, data.password, data.displayName, data.firstName, data.lastName);
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
          <span>Prénom</span>
          <input className="input-sticker" {...register("firstName")} />
          {errors.firstName && <span className="sticker-form__error">{errors.firstName.message}</span>}
        </label>
        <label className="sticker-form__field">
          <span>Nom</span>
          <input className="input-sticker" {...register("lastName")} />
          {errors.lastName && <span className="sticker-form__error">{errors.lastName.message}</span>}
        </label>
        <label className="sticker-form__field">
          <span>Nom affiché</span>
          <input className="input-sticker" {...register("displayName")} />
          {errors.displayName && <span className="sticker-form__error">{errors.displayName.message}</span>}
        </label>
        <label className="sticker-form__field">
          <span>Mot de passe (8 caractères min.)</span>
          <input className="input-sticker" type="password" {...register("password")} />
          {errors.password && <span className="sticker-form__error">{errors.password.message}</span>}
        </label>
        {serverError && <p className="sticker-form__error sticker-form__error--banner">{serverError}</p>}
        <button type="submit" className="btn-sticker" disabled={isSubmitting}>
          Créer mon compte
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
