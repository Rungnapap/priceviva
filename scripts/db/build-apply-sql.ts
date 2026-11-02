/**
 * Builds supabase/apply/priceviva_apply_all.sql: every migration in supabase/migrations, in order, inside ONE
 * transaction with checks before and after. Paste the result into the Supabase SQL editor; if any check fails,
 * PostgreSQL rolls everything back and nothing is changed.
 *
 *   npx tsx scripts/db/build-apply-sql.ts          (rewrites the file)
 * tests/apply-bundle.test.ts fails if the committed file is out of date with the migrations.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Catalogue and import tables: no access at all through the public API (read via pa_catalog_* functions). */
export const CATALOG_TABLES = [
  "retailers", "products", "variants", "variant_images", "feeds", "import_runs", "import_errors", "offers", "price_observations",
  "fx_rates", "category_mappings", "match_reviews", "click_events", "stores", "promotions", "promotion_stores",
] as const;
/** Private per-user tables: signed-in users reach only their own rows (row-level security, user_id = auth.uid()). */
export const USER_TABLES = ["user_saved_products", "price_alerts"] as const;
/** Server-only tables (secret key through security-definer functions). */
export const SERVER_TABLES = ["price_alert_events"] as const;
export const EXPECTED_TABLES = [...CATALOG_TABLES, ...USER_TABLES, ...SERVER_TABLES] as const;
/** Callable with the public (anon / publishable) key. */
export const PUBLIC_FUNCTIONS = [
  "pa_catalog_product", "pa_catalog_by_ids", "pa_catalog_list", "pa_catalog_search", "pa_catalog_suggest", "pa_catalog_meta",
  "pa_catalog_price_drops", "pa_catalog_local_offers", "pa_catalog_price_history", "pa_catalog_sitemap",
] as const;
/** Callable only with the secret (service_role) key. */
export const SERVER_FUNCTIONS = [
  "pa_import_start", "pa_import_batch", "pa_import_log_errors", "pa_import_finish", "pa_fx_upsert", "pa_offer_redirect",
  "pa_admin_overview", "pa_admin_feed_get", "pa_admin_feeds_due", "pa_admin_feeds_upsert", "pa_admin_feed_update", "pa_admin_run",
  "pa_admin_issues", "pa_admin_review_set", "pa_admin_category_set",
  "pa_alerts_due", "pa_alert_observe", "pa_alert_event_update", "pa_alert_unsubscribe",
] as const;
/** Callable only by a signed-in user (their own data, row-level security applies). */
export const USER_FUNCTIONS = ["pa_me_data", "pa_me_sync"] as const;
/** Used only inside the database. */
export const INTERNAL_FUNCTIONS = ["pa_norm", "pa_catalog_category", "pa_slugify", "pa_refresh_search_doc", "pa_conflicts", "pa_variant_json", "pa_alerts_guard"] as const;

const root = path.resolve(import.meta.dirname, "../..");
export const BUNDLE_PATH = path.join(root, "supabase/apply/priceviva_apply_all.sql");

const list = (xs: readonly string[]) => `array[${xs.map((x) => `'${x}'`).join(", ")}]`;

export function buildApplySql(): string {
  const dir = path.join(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const total = PUBLIC_FUNCTIONS.length + SERVER_FUNCTIONS.length + INTERNAL_FUNCTIONS.length + USER_FUNCTIONS.length;
  const out: string[] = [];
  out.push(`-- =============================================================================
-- PriceViva — apply all database migrations in ONE transaction  (GENERATED FILE, do not edit by hand)
-- Source: ${files.map((f) => `supabase/migrations/${f}`).join(", ")}
-- Rebuild: npx tsx scripts/db/build-apply-sql.ts
--
-- What it does: creates PriceViva's ${EXPECTED_TABLES.length} tables and ${total} pa_* functions, the pg_trgm and unaccent extensions
-- (schema "extensions"), row-level security and permissions. It deletes nothing and does not touch other tables.
-- Accounts use Supabase Auth: passwords stay in auth.users; PriceViva's own tables never store a password.
-- Safety: everything runs inside BEGIN … COMMIT. If any step or check fails, nothing is changed.
-- =============================================================================
begin;

-- ---- Pre-checks -------------------------------------------------------------
do $pv$
declare ext text; sch text;
begin
  if to_regclass('auth.users') is null then
    raise exception 'Supabase Auth (auth.users) was not found. Run this in a Supabase project. Nothing was changed.';
  end if;
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PriceViva needs PostgreSQL 15 or newer; this server is %. Nothing was changed.', current_setting('server_version');
  end if;
  foreach ext in array array['pg_trgm', 'unaccent', 'pgcrypto'] loop
    select n.nspname into sch from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = ext;
    if sch is not null and sch <> 'extensions' then
      raise exception 'Extension % is installed in schema "%", but PriceViva needs it in schema "extensions". Nothing was changed.', ext, sch;
    end if;
  end loop;
end $pv$;
`);
  for (const f of files) {
    out.push(`-- ============================ BEGIN ${f} ============================`);
    out.push(readFileSync(path.join(dir, f), "utf8").trimEnd());
    out.push(`-- ============================ END ${f} ==============================\n`);
  }
  out.push(`-- ---- Verification: any problem raises an error and rolls back everything above ----
do $pv$
declare t text; f text; n int; problems text[] := '{}';
begin
  foreach t in array ${list(EXPECTED_TABLES)} loop
    if to_regclass('public.' || t) is null then problems := problems || ('missing table ' || t); continue; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then problems := problems || ('row-level security is off on ' || t); end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      problems := problems || ('the public key can access table ' || t);
    end if;
  end loop;
  foreach t in array ${list([...CATALOG_TABLES, ...SERVER_TABLES])} loop
    if to_regclass('public.' || t) is not null and has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      problems := problems || ('signed-in users can access table ' || t || ' directly');
    end if;
  end loop;
  foreach t in array ${list(USER_TABLES)} loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then problems := problems || ('signed-in users cannot read their own ' || t); end if;
    if has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE,REFERENCES,TRIGGER') then problems := problems || ('signed-in users have too many rights on ' || t); end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if n < 3 then problems := problems || ('row-level security policies missing on ' || t); end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
               and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%') then
      problems := problems || ('a policy on ' || t || ' does not check the signed-in user');
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and roles <> array['authenticated']::name[]) then
      problems := problems || ('a policy on ' || t || ' applies to more than signed-in users');
    end if;
  end loop;
  -- Server-managed alert fields: never writable by signed-in users (column privileges + guard trigger).
  foreach f in array array['email_notified_minor', 'email_notified_at', 'created_at', 'updated_at'] loop
    if has_column_privilege('authenticated', 'public.price_alerts', f, 'INSERT') or has_column_privilege('authenticated', 'public.price_alerts', f, 'UPDATE') then
      problems := problems || ('signed-in users can write price_alerts.' || f);
    end if;
  end loop;
  foreach f in array array['user_id', 'id', 'product_id', 'destination'] loop
    if has_column_privilege('authenticated', 'public.price_alerts', f, 'UPDATE') then
      problems := problems || ('signed-in users can change price_alerts.' || f);
    end if;
  end loop;
  foreach f in array array['product_name', 'product_slug', 'target_minor', 'currency', 'paused', 'email_enabled'] loop
    if not has_column_privilege('authenticated', 'public.price_alerts', f, 'UPDATE') then
      problems := problems || ('signed-in users cannot manage price_alerts.' || f);
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.user_saved_products', 'UPDATE') or has_column_privilege('authenticated', 'public.user_saved_products', 'created_at', 'INSERT') then
    problems := problems || 'signed-in users can rewrite saved-product rows';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.price_alerts'::regclass and tgname = 'pa_alerts_guard' and tgenabled <> 'D') then
    problems := problems || 'the price_alerts guard trigger is missing or disabled';
  end if;
  select count(distinct proname) into n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'pa\\_%';
  if n <> ${total} then problems := problems || format('expected ${total} pa_* functions, found %s', n); end if;
  foreach f in array ${list(PUBLIC_FUNCTIONS)} loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f and has_function_privilege('anon', p.oid, 'EXECUTE')) then
      problems := problems || ('public key cannot call ' || f);
    end if;
  end loop;
  foreach f in array ${list([...SERVER_FUNCTIONS, ...INTERNAL_FUNCTIONS])} loop
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
               and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then
      problems := problems || ('public key can call ' || f);
    end if;
  end loop;
  foreach f in array ${list(USER_FUNCTIONS)} loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
                   and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
                   and not p.prosecdef) then
      problems := problems || ('account function ' || f || ' has the wrong permissions');
    end if;
  end loop;
  foreach f in array ${list(SERVER_FUNCTIONS)} loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f and has_function_privilege('service_role', p.oid, 'EXECUTE')) then
      problems := problems || ('secret key cannot call ' || f);
    end if;
  end loop;
  foreach t in array array['pg_trgm', 'unaccent', 'pgcrypto'] loop
    if not exists (select 1 from pg_extension e join pg_namespace s on s.oid = e.extnamespace where e.extname = t and s.nspname = 'extensions') then
      problems := problems || ('extension ' || t || ' is not in schema extensions');
    end if;
  end loop;
  if cardinality(problems) > 0 then
    raise exception 'PriceViva verification failed, so nothing was changed: %', array_to_string(problems, '; ');
  end if;
end $pv$;

commit;

-- ---- Read-only summary (shown in the SQL editor) ----
select 'tables' as item, count(*)::text as value from pg_tables where schemaname = 'public' and tablename = any(${list(EXPECTED_TABLES)})
union all select 'account tables protected by row-level security', count(*)::text from pg_tables where schemaname = 'public' and rowsecurity and tablename = any(${list([...USER_TABLES, ...SERVER_TABLES])})
union all select 'pa_* functions', count(distinct proname)::text from pg_proc where pronamespace = 'public'::regnamespace and proname like 'pa\\_%'
union all select 'functions callable with the public key', count(distinct proname)::text from pg_proc where pronamespace = 'public'::regnamespace and proname like 'pa\\_%' and has_function_privilege('anon', oid, 'EXECUTE')
union all select 'extensions', string_agg(e.extname || ' in ' || n.nspname, ', ' order by e.extname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname in ('pg_trgm', 'unaccent', 'pgcrypto')
union all select 'result', 'PriceViva database is ready (everything above was verified before COMMIT)';
`);
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  writeFileSync(BUNDLE_PATH, buildApplySql());
  console.log("wrote", path.relative(root, BUNDLE_PATH));
}
