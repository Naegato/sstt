import { z } from "zod";

export const joinRoomSchema = z.object({
  roomId: z
    .string()
    .trim()
    .min(1, "Choisis un nom de room.")
    .max(40, "40 caractères max.")
    .regex(/^[a-zA-Z0-9-]+$/, "Lettres, chiffres et tirets uniquement."),
  playerName: z.string().trim().min(1, "Choisis un nom.").max(24, "24 caractères max."),
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

export const loginSchema = z.object({
  email: z.string().trim().min(1, "L'email est requis.").email("Adresse email invalide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().trim().min(1, "L'email est requis.").email("Adresse email invalide."),
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(40, "40 caractères max."),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(40, "40 caractères max."),
  displayName: z.string().trim().min(1, "Choisis un nom affiché.").max(40, "40 caractères max."),
  password: z.string().min(8, "8 caractères minimum."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
