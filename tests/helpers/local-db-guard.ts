/**
 * SAFETY GUARD for the database integration tests.
 *
 * tests/importer.db.test.ts DROPS and recreates a database ("pa_it") and creates roles on the server named in
 * PA_TEST_PG. That must only ever be a throwaway PostgreSQL on this computer, never Supabase or any other server.
 * This check runs before any connection is made.
 */
export type LocalPg = { ok: true; host: string; port: string; user: string } | { ok: false; reason: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
/** libpq settings that can silently send psql somewhere other than the -h host. */
const REDIRECTING_ENV = ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"] as const;

export function checkLocalTestPg(value: string | undefined, env: Record<string, string | undefined> = process.env): LocalPg {
  if (!value || value.trim() === "") return { ok: false, reason: "PA_TEST_PG is not set." };
  const parts = value.trim().split(":");
  if (parts.length !== 3) return { ok: false, reason: 'PA_TEST_PG must look like "localhost:5432:postgres" (host:port:user).' };
  const [host = "", port = "", user = ""] = parts;
  const isSocketDir = host.startsWith("/") && !host.includes("..");
  if (!LOCAL_HOSTS.has(host.toLowerCase()) && !isSocketDir) {
    return { ok: false, reason: `Refusing to run: PA_TEST_PG host must be localhost, 127.0.0.1 or a local socket directory. These tests delete a database, so they never run against a remote server such as Supabase.` };
  }
  const portNum = Number(port);
  if (!/^\d+$/.test(port) || portNum < 1 || portNum > 65535) return { ok: false, reason: "PA_TEST_PG port must be a number between 1 and 65535." };
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) return { ok: false, reason: "PA_TEST_PG user must be a plain role name such as postgres." };
  for (const name of REDIRECTING_ENV) {
    if (env[name] && env[name]!.trim() !== "") {
      return { ok: false, reason: `Refusing to run: the environment variable ${name} is set and could send the test connection to another server. Remove it in this window first (Remove-Item Env:${name}).` };
    }
  }
  return { ok: true, host, port, user };
}
