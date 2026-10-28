/** An isolated PostgreSQL WASM instance. No URL, credentials, sockets or production connection. */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export async function memoryCatalog() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto, unaccent } });
  try {
    const root = path.resolve(import.meta.dirname, "../..");
    await db.exec(readFileSync(path.join(root, "scripts/db/local-supabase-roles.sql"), "utf8"));
    const migrations = readdirSync(path.join(root, "supabase/migrations")).filter(f => f.endsWith(".sql")).sort();
    for (const file of migrations) await db.exec(readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
    // Additive migrations must be safe to replay, as in the existing native DB suite.
    for (const file of migrations.slice(1)) await db.exec(readFileSync(path.join(root, "supabase/migrations", file), "utf8"));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
