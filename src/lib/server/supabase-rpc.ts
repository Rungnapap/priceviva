/**
 * Minimal Supabase/PostgREST RPC client (fetch only, no SDK).
 * All database access in PriceAtlas goes through `pa_*` SQL functions that take one jsonb argument `p`.
 *   role "anon"    -> public catalogue reads (anon key; RLS + function grants enforce read-only)
 *   role "service" -> importer/admin/redirect (service-role key, server-only)
 *   role "user"    -> a signed-in visitor's own data (public key + the visitor's access token; row-level security)
 */
import { redact, serverEnv } from "./env";

export class RpcError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface RpcOptions {
  role: "anon" | "service" | "user";
  /** Required for role "user": the visitor's Supabase access token (from the httpOnly session cookie). */
  accessToken?: string;
  /** Seconds to cache (Next.js data cache) for anon reads; `false` = never cache. */
  revalidate?: number | false;
  timeoutMs?: number;
}

export function rpcConfigured(role: "anon" | "service"): boolean {
  return !!serverEnv.supabaseUrl && !!(role === "anon" ? serverEnv.supabaseAnonKey : serverEnv.supabaseServiceKey);
}

export async function rpc<T>(fn: string, p: unknown, opts: RpcOptions): Promise<T> {
  if (!/^pa_[a-z_]+$/.test(fn)) throw new Error(`Invalid function name ${fn}`);
  const url = serverEnv.supabaseUrl;
  const key = opts.role === "service" ? serverEnv.supabaseServiceKey : serverEnv.supabaseAnonKey;
  if (!url || !key) throw new RpcError(`Supabase is not configured for ${opts.role} access.`, 0);
  if (opts.role === "user" && !opts.accessToken) throw new RpcError("Not signed in.", 401);

  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Content-Profile": "public",
  };
  // A signed-in visitor's token goes in Authorization (Supabase verifies it; RLS uses its user id).
  // Legacy JWT keys also go in Authorization; new sb_publishable_/sb_secret_ keys are sent as apikey only.
  if (opts.role === "user") headers.Authorization = `Bearer ${opts.accessToken}`;
  else if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  const init: RequestInit & { next?: { revalidate: number } } = {
    method: "POST",
    headers,
    body: JSON.stringify({ p }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  };
  if (opts.role === "anon" && typeof opts.revalidate === "number") init.next = { revalidate: opts.revalidate };
  else init.cache = "no-store";

  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${fn}`, init);
  } catch (e) {
    throw new RpcError(redact(`Database request failed (${fn}): ${(e as Error).message}`), 0);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text) as { message?: string; hint?: string };
      msg = [j.message, j.hint].filter(Boolean).join(" — ");
    } catch {
      /* keep text */
    }
    throw new RpcError(redact(`Database error in ${fn} (${res.status}): ${msg.slice(0, 500)}`), res.status);
  }
  return (text ? JSON.parse(text) : null) as T;
}
