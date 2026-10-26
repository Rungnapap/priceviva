/**
 * Checks the Supabase settings for dangerous mix-ups WITHOUT ever returning a value: messages name the variable only.
 *   * a secret / service_role key in a NEXT_PUBLIC_ variable (would be shipped to every visitor's browser),
 *   * the public key used where the secret key belongs (imports and admin would fail),
 *   * a malformed project URL.
 * Used by /admin (Overview) and `npm run env:check`.
 */
export interface EnvProblem {
  level: "error" | "warning";
  variable: string;
  message: string;
}

type Env = Record<string, string | undefined>;

/** The role inside a legacy Supabase JWT key ("anon" / "service_role"), or null if it is not one. */
export function legacyJwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3 || !key.startsWith("eyJ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8")) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** "secret" for keys that give full database access, "public" for keys meant to be public, "unknown" otherwise. */
export function keyKind(key: string): "secret" | "public" | "unknown" {
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "public";
  const role = legacyJwtRole(key);
  if (role === "service_role") return "secret";
  if (role === "anon") return "public";
  return "unknown";
}

const val = (env: Env, name: string) => {
  const v = env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
};

export function supabaseEnvProblems(env: Env): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const url = val(env, "NEXT_PUBLIC_SUPABASE_URL");
  const pub = val(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const secret = val(env, "SUPABASE_SERVICE_ROLE_KEY");

  // 1. Any NEXT_PUBLIC_ variable holding a secret key is an emergency: Next.js may put it in browser code.
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (keyKind(value.trim()) === "secret" || value.includes("sb_secret_")) {
      problems.push({ level: "error", variable: name, message: "contains a SECRET key. Remove it now, delete/rotate that key in Supabase (Settings → API Keys), and use the publishable key here instead." });
    }
  }

  if (url) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      problems.push({ level: "error", variable: "NEXT_PUBLIC_SUPABASE_URL", message: "is not a valid URL. Use the Project URL, e.g. https://<project-ref>.supabase.co" });
    }
    if (parsed) {
      const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      if (parsed.protocol !== "https:" && !local) problems.push({ level: "error", variable: "NEXT_PUBLIC_SUPABASE_URL", message: "must start with https://" });
      if (parsed.pathname !== "/" && parsed.pathname !== "") problems.push({ level: "error", variable: "NEXT_PUBLIC_SUPABASE_URL", message: "must be the bare Project URL without a path (no /rest/v1 or /dashboard)." });
      if (url.startsWith("postgres")) problems.push({ level: "error", variable: "NEXT_PUBLIC_SUPABASE_URL", message: "looks like a database connection string. Use the Project URL instead and never put the database password in .env.local." });
      if (!local && !parsed.hostname.endsWith(".supabase.co")) problems.push({ level: "warning", variable: "NEXT_PUBLIC_SUPABASE_URL", message: "is not a *.supabase.co address. Fine for a custom domain, otherwise check it." });
    }
  }

  if (pub && keyKind(pub) === "unknown") {
    problems.push({ level: "warning", variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY", message: "is not recognised as a Supabase publishable (sb_publishable_…) or legacy anon key." });
  }
  if (secret) {
    const kind = keyKind(secret);
    if (kind === "public") problems.push({ level: "error", variable: "SUPABASE_SERVICE_ROLE_KEY", message: "holds the PUBLIC key. Use the secret key (sb_secret_…) or legacy service_role key." });
    if (kind === "unknown") problems.push({ level: "warning", variable: "SUPABASE_SERVICE_ROLE_KEY", message: "is not recognised as a Supabase secret (sb_secret_…) or legacy service_role key." });
    if (pub && pub === secret) problems.push({ level: "error", variable: "SUPABASE_SERVICE_ROLE_KEY", message: "is the same as the public key. They must be two different keys." });
  }
  if ((pub || secret) && !url) problems.push({ level: "error", variable: "NEXT_PUBLIC_SUPABASE_URL", message: "is missing while a Supabase key is set." });
  if (val(env, "DATABASE_URL") || val(env, "SUPABASE_DB_URL") || val(env, "POSTGRES_URL")) {
    problems.push({ level: "warning", variable: "DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL", message: "is set, but PriceViva never needs a database connection string. Remove it so the database password is not stored here." });
  }
  for (const name of ["RESEND_API_KEY", "ALERT_EMAIL_SECRET"]) {
    if (Object.keys(env).some((k) => k === `NEXT_PUBLIC_${name}`)) problems.push({ level: "error", variable: `NEXT_PUBLIC_${name}`, message: "is a server-only secret. Rename it without NEXT_PUBLIC_ and rotate it." });
  }
  return problems;
}
