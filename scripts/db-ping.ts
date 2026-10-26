/**
 * npm run db:ping — READ-ONLY check that PriceViva can reach its Supabase database.
 *   1. checks .env.local for key mix-ups (values are never printed);
 *   2. public (publishable/anon) key: calls pa_catalog_meta and prints only counts;
 *   3. public key must be REFUSED by a server-only function (security check);
 *   4. secret key (if set): calls pa_admin_overview (read-only) and prints only counts.
 * Nothing is written to the database. Does not change CATALOG_SOURCE: the website stays in sample mode.
 */
import { supabaseEnvProblems } from "../src/lib/server/env-check";
import { rpc, RpcError } from "../src/lib/server/supabase-rpc";

let failed = false;
const ok = (msg: string) => console.log(`  OK    ${msg}`);
const bad = (msg: string) => {
  failed = true;
  console.log(`  FAIL  ${msg}`);
};

function explain(e: unknown): string {
  if (!(e instanceof RpcError)) return (e as Error).message;
  if (e.status === 0) return `${e.message} (no answer: check NEXT_PUBLIC_SUPABASE_URL and your internet connection)`;
  if (e.status === 401) return `${e.message} (the key was rejected: copy it again from Supabase → Project Settings → API Keys)`;
  if (e.status === 404 || /PGRST202|Could not find the function|function public\.pa_[a-z_]+\(.*\) does not exist/i.test(e.message)) return `${e.message} (PriceViva's database functions are not installed: run supabase/apply/priceviva_apply_all.sql first)`;
  return e.message;
}

async function main() {
  console.log("PriceViva database connection test (read-only)\n");
  const problems = supabaseEnvProblems(process.env);
  for (const p of problems) console.log(`  ${p.level === "error" ? "FAIL " : "WARN "} ${p.variable} ${p.message}`);
  if (problems.some((p) => p.level === "error")) return void (failed = true);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    bad("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local");
    return;
  }
  console.log(`  Project: ${new URL(url).hostname}\n`);

  // 2. Public read
  let readOk = false;
  try {
    const meta = await rpc<{ products: number; offers: number; retailers: unknown[]; stores: number; fx: { asOf: string | null } | null }>(
      "pa_catalog_meta", {}, { role: "anon", revalidate: false },
    );
    readOk = true;
    ok(`public key can read the catalogue: ${meta.products} products, ${meta.offers} active offers, ${meta.retailers.length} retailers, ${meta.stores} stores${meta.fx?.asOf ? `, exchange rates from ${meta.fx.asOf}` : ", no exchange rates imported yet"}`);
  } catch (e) {
    bad(`public read failed: ${explain(e)}`);
  }

  // 3. Public key must not reach server-only functions (only meaningful once the public key itself works)
  if (!readOk) {
    console.log("  SKIP  server-only protection check (needs a working public key first)");
  } else try {
    await rpc("pa_admin_overview", {}, { role: "anon", revalidate: false });
    bad("SECURITY: the public key could call pa_admin_overview. Re-run supabase/apply/priceviva_apply_all.sql and tell Claude.");
  } catch (e) {
    if (e instanceof RpcError && e.status !== 0) ok("public key is refused by server-only functions (as it should be)");
    else bad(`could not check server-only protection: ${explain(e)}`);
  }

  // 4. Secret key (server only)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.log("  SKIP  secret key not set (only needed for imports and /admin)");
    return;
  }
  try {
    const o = await rpc<{ feeds: unknown[]; counts: Record<string, number> }>("pa_admin_overview", {}, { role: "service" });
    ok(`secret key works (read-only overview): ${o.feeds.length} feeds, ${o.counts.variants ?? 0} products, ${o.counts.active_offers ?? 0} active offers`);
  } catch (e) {
    bad(`secret key check failed: ${explain(e)}`);
  }
}

main()
  .catch((e: unknown) => bad(explain(e)))
  .finally(() => {
    console.log(failed ? "\nResult: NOT working yet (see FAIL lines above)." : "\nResult: connection is working. The website stays in sample mode until you switch CATALOG_SOURCE.");
    process.exit(failed ? 1 : 0);
  });
