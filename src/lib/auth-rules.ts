/**
 * Account form rules, shared by the browser forms and the server routes (the server always re-checks).
 * Error values are message keys ("auth.err.*"), so every language shows its own text.
 */
import { z } from "zod";

export const PASSWORD_MIN = 8;
/** Supabase Auth hashes with bcrypt, which only uses the first 72 bytes. */
export const PASSWORD_MAX = 72;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "auth.err.emailRequired")
  .max(254, "auth.err.emailInvalid")
  .email("auth.err.emailInvalid");

export const passwordSchema = z
  .string()
  .min(1, "auth.err.passwordRequired")
  .min(PASSWORD_MIN, "auth.err.passwordShort")
  .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX, "auth.err.passwordLong")
  .refine((p) => /\p{L}/u.test(p) && /\d/.test(p), "auth.err.passwordWeak");

export const loginSchema = z.object({
  email: emailSchema,
  // At login, only check that something was typed: the rules may have been different when the account was made.
  password: z.string().min(1, "auth.err.passwordRequired").max(1024, "auth.err.passwordLong"),
  next: z.string().max(300).optional(),
});

export const signupSchema = z
  .object({ email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "auth.err.passwordMismatch" });

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "auth.err.passwordMismatch" });

export type FieldErrors = Partial<Record<"email" | "password" | "confirm" | "form", string>>;

/** First error per field, as message keys. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = (issue.path[0] as keyof FieldErrors | undefined) ?? "form";
    if (!out[key]) out[key] = issue.message.startsWith("auth.") ? issue.message : "auth.err.invalid";
  }
  return out;
}

/**
 * Where to go after signing in. Only same-site paths are allowed ("/account", "/alerts?x=1"),
 * never "//evil.example" or "https://…", so a login link can't send people to another website.
 */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  if (/^\/(api|auth)\//.test(next) || next === "/login" || next === "/signup") return fallback;
  return next.slice(0, 300);
}
