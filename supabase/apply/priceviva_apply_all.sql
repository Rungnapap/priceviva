-- =============================================================================
-- PriceViva — apply all database migrations in ONE transaction  (GENERATED FILE, do not edit by hand)
-- Source: supabase/migrations/20261024120000_catalog.sql, supabase/migrations/20261025120000_local_offers_price_history.sql, supabase/migrations/20261026120000_lock_helper_functions.sql, supabase/migrations/20261026130000_accounts.sql, supabase/migrations/20261027120000_category_reclassification.sql, supabase/migrations/20261027230000_sync_parent_categories.sql
-- Rebuild: npx tsx scripts/db/build-apply-sql.ts
--
-- What it does: creates PriceViva's 19 tables and 36 pa_* functions, the pg_trgm and unaccent extensions
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

-- ============================ BEGIN 20261024120000_catalog.sql ============================
-- =============================================================================
-- PriceAtlas — catalogue, feeds and import schema (Supabase / PostgreSQL 15+)
--
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Design rules:
--   * products (model family) -> variants (exact sellable item: GTIN, colour,
--     size, condition) -> offers (one retailer's listing of one variant).
--   * Unknown amounts are NULL, never 0.
--   * The public (anon) role can only READ active catalogue data through
--     pa_catalog_* functions. All writes go through service_role functions.
--   * Every function takes one jsonb argument `p` and returns jsonb, so it is
--     called the same way through PostgREST: POST /rest/v1/rpc/<name> {"p":{…}}.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Immutable wrapper so unaccent can be used in indexes.
create or replace function public.pa_norm(t text) returns text
language sql immutable parallel safe
set search_path = public, extensions
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

-- -----------------------------------------------------------------------------
-- Retailers & catalogue
-- -----------------------------------------------------------------------------
create table if not exists public.retailers (
  id            uuid primary key default extensions.gen_random_uuid(),
  source        text not null check (source in ('awin','ebay','amazon','direct','manual')),
  external_id   text not null,
  name          text not null,
  country       text check (country ~ '^[A-Z]{2}$'),
  website_domain text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (source, external_id)
);

create table if not exists public.products (
  id              uuid primary key default extensions.gen_random_uuid(),
  family_key      text not null unique,
  brand           text,
  name            text not null,
  mpn             text,
  department_slug text,
  subcategory_slug text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.variants (
  id              uuid primary key default extensions.gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  identity_key    text not null unique,
  slug            text not null unique,
  title           text not null,
  brand           text,
  mpn             text,
  gtin            text check (gtin is null or gtin ~ '^[0-9]{14}$'),
  condition       text not null default 'new' check (condition in ('new','open_box','refurbished','used')),
  colour          text,
  size            text,
  variant_label   text not null default '',
  description     text,
  specs           jsonb not null default '{}'::jsonb,
  keywords        text not null default '',
  department_slug text,
  subcategory_slug text,
  source_category text,
  search_doc      tsvector,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists variants_gtin_idx on public.variants (gtin) where gtin is not null;
create index if not exists variants_dept_idx on public.variants (department_slug, subcategory_slug);
create index if not exists variants_search_idx on public.variants using gin (search_doc);
create index if not exists variants_title_trgm on public.variants using gin (public.pa_norm(title) extensions.gin_trgm_ops);
create index if not exists variants_product_idx on public.variants (product_id);

create table if not exists public.variant_images (
  id           uuid primary key default extensions.gen_random_uuid(),
  variant_id   uuid not null references public.variants(id) on delete cascade,
  url          text not null check (url ~ '^https://'),
  position     int not null default 0,
  source       text not null,
  feed_id      uuid,
  alt          text,
  licence_note text not null default 'Supplied in the advertiser product feed for promoting this product; hot-linked, not re-hosted.',
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (variant_id, url)
);

-- -----------------------------------------------------------------------------
-- Feeds & imports
-- -----------------------------------------------------------------------------
create table if not exists public.feeds (
  id               uuid primary key default extensions.gen_random_uuid(),
  provider         text not null check (provider in ('awin','ebay','amazon','direct')),
  external_feed_id text not null,
  advertiser_id    text,
  advertiser_name  text,
  name             text,
  country          text check (country ~ '^[A-Z]{2}$'),
  language         text,
  currency         text check (currency ~ '^[A-Z]{3}$'),
  -- Download URL with the API key REPLACED by {API_KEY}. The key itself lives only in env vars.
  download_url_template text check (download_url_template is null or download_url_template not ilike '%apikey/%' or download_url_template ilike '%apikey/{API_KEY}%'),
  membership_status text,
  enabled          boolean not null default false,
  refresh_hours    int not null default 24 check (refresh_hours between 6 and 168),
  vat_included     boolean not null default true,
  provider_last_imported_at timestamptz,
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  last_status      text,
  last_message     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider, external_feed_id)
);

create table if not exists public.import_runs (
  id                 uuid primary key default extensions.gen_random_uuid(),
  feed_id            uuid not null references public.feeds(id) on delete cascade,
  trigger            text not null check (trigger in ('cron','manual','cli','test')),
  status             text not null default 'running' check (status in ('running','succeeded','partial','failed','skipped')),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  rows_total         int not null default 0,
  rows_imported      int not null default 0,
  rows_rejected      int not null default 0,
  variants_created   int not null default 0,
  offers_created     int not null default 0,
  offers_updated     int not null default 0,
  offers_deactivated int not null default 0,
  message            text
);
create index if not exists import_runs_feed_idx on public.import_runs (feed_id, started_at desc);

create table if not exists public.import_errors (
  id          bigint generated always as identity primary key,
  run_id      uuid not null references public.import_runs(id) on delete cascade,
  row_number  int,
  external_id text,
  severity    text not null default 'error' check (severity in ('error','warning')),
  code        text not null,
  message     text not null,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists import_errors_run_idx on public.import_errors (run_id);

-- -----------------------------------------------------------------------------
-- Offers & prices
-- -----------------------------------------------------------------------------
create table if not exists public.offers (
  id                 uuid primary key default extensions.gen_random_uuid(),
  variant_id         uuid not null references public.variants(id) on delete cascade,
  retailer_id        uuid not null references public.retailers(id) on delete cascade,
  feed_id            uuid references public.feeds(id) on delete set null,
  source             text not null,
  external_id        text not null,
  title_at_source    text,
  price_minor        bigint not null check (price_minor >= 0),
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  vat_included       boolean not null default true,
  rrp_minor          bigint check (rrp_minor is null or rrp_minor >= 0),
  ship_from          text check (ship_from ~ '^[A-Z]{2}$'),
  stock              text not null default 'unknown' check (stock in ('in_stock','low_stock','out_of_stock','unknown')),
  product_url        text,
  click_url          text,
  -- {"SE": {"shipping": {"amountMinor": 4900|null, "basis": "verified"|"unknown"}, "importCharges": {...}}}
  destinations       jsonb not null default '{}'::jsonb,
  delivery_time      text,
  is_active          boolean not null default true,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  source_updated_at  timestamptz,
  last_import_run_id uuid,
  updated_at         timestamptz not null default now(),
  unique (source, retailer_id, external_id)
);
create index if not exists offers_variant_idx on public.offers (variant_id) where is_active;
create index if not exists offers_feed_run_idx on public.offers (feed_id, last_import_run_id);

create table if not exists public.price_observations (
  id             bigint generated always as identity primary key,
  offer_id       uuid not null references public.offers(id) on delete cascade,
  price_minor    bigint not null,
  currency       text not null,
  shipping_minor bigint,
  observed_at    timestamptz not null default now(),
  import_run_id  uuid
);
create index if not exists price_obs_offer_idx on public.price_observations (offer_id, observed_at desc);

create table if not exists public.fx_rates (
  base     text not null,
  quote    text not null,
  rate     numeric(18,8) not null check (rate > 0),
  as_of    date not null,
  source   text not null,
  primary key (base, quote, as_of)
);

-- -----------------------------------------------------------------------------
-- Moderation & mapping
-- -----------------------------------------------------------------------------
create table if not exists public.category_mappings (
  id               uuid primary key default extensions.gen_random_uuid(),
  source           text not null,
  source_category  text not null,
  department_slug  text,
  subcategory_slug text,
  manual           boolean not null default false,
  product_count    int not null default 0,
  updated_at       timestamptz not null default now(),
  unique (source, source_category)
);

create table if not exists public.match_reviews (
  id          uuid primary key default extensions.gen_random_uuid(),
  variant_id  uuid references public.variants(id) on delete cascade,
  reason      text not null check (reason in ('gtin_attribute_conflict','possible_duplicate')),
  detail      jsonb not null default '{}'::jsonb,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);

create table if not exists public.click_events (
  id          bigint generated always as identity primary key,
  offer_id    uuid not null references public.offers(id) on delete cascade,
  from_path   text,
  created_at  timestamptz not null default now()
  -- No IP address, user agent or user id is stored.
);

-- Verified physical stores & promotions (Local Deal Radar). Intentionally empty
-- until verified merchant data exists — nothing is generated.
create table if not exists public.stores (
  id           uuid primary key default extensions.gen_random_uuid(),
  retailer_id  uuid not null references public.retailers(id) on delete cascade,
  name         text not null,
  address_line text not null,
  postal_code  text,
  city         text not null,
  country      text not null check (country ~ '^[A-Z]{2}$'),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  source       text not null,
  verified_at  timestamptz not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.promotions (
  id            uuid primary key default extensions.gen_random_uuid(),
  retailer_id   uuid not null references public.retailers(id) on delete cascade,
  variant_id    uuid references public.variants(id) on delete set null,
  department_slug text,
  title         text not null,
  promo_price_minor bigint,
  currency      text,
  reference_price_minor bigint,
  reference_evidence text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),
  scope         text not null check (scope in ('in_store','online','both')),
  pickup        boolean not null default false,
  terms         text,
  source        text not null,
  verification  text not null default 'pending' check (verification in ('pending','verified','rejected')),
  created_at    timestamptz not null default now()
);
create table if not exists public.promotion_stores (
  promotion_id uuid references public.promotions(id) on delete cascade,
  store_id     uuid references public.stores(id) on delete cascade,
  primary key (promotion_id, store_id)
);

-- -----------------------------------------------------------------------------
-- Row-level security: no direct table access for anon/authenticated.
-- Public reads happen only through the security-definer pa_catalog_* functions,
-- which return active, non-sensitive columns. service_role bypasses RLS.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['retailers','products','variants','variant_images','feeds','import_runs','import_errors',
    'offers','price_observations','fx_rates','category_mappings','match_reviews','click_events','stores','promotions','promotion_stores']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- =============================================================================
-- Helper functions
-- =============================================================================
create or replace function public.pa_slugify(t text) returns text
language sql immutable
set search_path = public, extensions
as $$
  select trim(both '-' from regexp_replace(public.pa_norm(t), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.pa_refresh_search_doc(v_id uuid) returns void
language sql
set search_path = public, extensions
as $$
  update public.variants v set search_doc =
      setweight(to_tsvector('simple', public.pa_norm(coalesce(v.title,''))), 'A')
   || setweight(to_tsvector('simple', public.pa_norm(coalesce(v.brand,'') || ' ' || coalesce(v.mpn,'') || ' ' || coalesce(v.variant_label,''))), 'A')
   || setweight(to_tsvector('simple', public.pa_norm(coalesce(v.keywords,'') || ' ' || coalesce(v.source_category,''))), 'B')
   || setweight(to_tsvector('simple', public.pa_norm(left(coalesce(v.description,''), 2000))), 'D')
  where v.id = v_id
$$;

-- Does an incoming attribute conflict with a stored one? (both present and different)
create or replace function public.pa_conflicts(a text, b text) returns boolean
language sql immutable
set search_path = public, extensions
as $$ select nullif(public.pa_norm(a),'') is not null and nullif(public.pa_norm(b),'') is not null and public.pa_norm(a) <> public.pa_norm(b) $$;

-- =============================================================================
-- IMPORT (service_role only)
-- =============================================================================

-- Start a run. Refuses to start if this feed already has a run in progress (< 3 h old).
create or replace function public.pa_import_start(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare f public.feeds; r uuid;
begin
  select * into f from public.feeds where id = (p->>'feed_id')::uuid;
  if not found then raise exception 'feed not found'; end if;
  if exists (select 1 from public.import_runs where feed_id = f.id and status = 'running' and started_at > now() - interval '3 hours') then
    return jsonb_build_object('started', false, 'reason', 'A run for this feed is already in progress');
  end if;
  update public.import_runs set status = 'failed', finished_at = now(), message = 'Abandoned (timed out)'
    where feed_id = f.id and status = 'running';
  insert into public.import_runs (feed_id, trigger) values (f.id, coalesce(p->>'trigger','manual')) returning id into r;
  update public.feeds set last_attempt_at = now(), last_status = 'running', updated_at = now() where id = f.id;
  return jsonb_build_object('started', true, 'run_id', r,
    'active_offers', (select count(*) from public.offers where feed_id = f.id and is_active));
end $$;

-- Import one batch of already-validated, normalised rows.
create or replace function public.pa_import_batch(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_run uuid := (p->>'run_id')::uuid;
  v_feed public.feeds;
  v_source text := p->>'source';
  v_ret jsonb := p->'retailer';
  v_retailer_id uuid;
  r jsonb;
  img jsonb;
  v_identity text;
  v_family text;
  v_product_id uuid;
  v_variant public.variants;
  v_variant_id uuid;
  v_offer public.offers;
  v_offer_id uuid;
  v_dept text; v_sub text;
  v_map public.category_mappings;
  v_slug text;
  v_cond text;
  v_new_variant boolean;
  n_imported int := 0; n_var int := 0; n_off_new int := 0; n_off_upd int := 0;
  pos int;
begin
  select * into v_feed from public.feeds where id = (p->>'feed_id')::uuid;
  if not found then raise exception 'feed not found'; end if;

  insert into public.retailers (source, external_id, name, country, website_domain)
  values (v_source, v_ret->>'external_id', v_ret->>'name', v_ret->>'country', v_ret->>'website_domain')
  on conflict (source, external_id) do update
    set name = excluded.name, country = coalesce(excluded.country, retailers.country),
        website_domain = coalesce(excluded.website_domain, retailers.website_domain), updated_at = now()
  returning id into v_retailer_id;

  for r in select * from jsonb_array_elements(p->'rows') loop
    v_cond := coalesce(r->>'condition', 'new');

    -- 1. Department: a manual admin mapping wins over the importer's automatic guess.
    v_dept := r->>'department_slug'; v_sub := r->>'subcategory_slug';
    if r->>'category' is not null then
      select * into v_map from public.category_mappings where source = v_source and source_category = r->>'category';
      if found and v_map.manual then v_dept := v_map.department_slug; v_sub := v_map.subcategory_slug; end if;
      insert into public.category_mappings (source, source_category, department_slug, subcategory_slug, product_count)
      values (v_source, r->>'category', v_dept, v_sub, 1)
      on conflict (source, source_category) do update
        set product_count = category_mappings.product_count + 1,
            department_slug = case when category_mappings.manual then category_mappings.department_slug else excluded.department_slug end,
            subcategory_slug = case when category_mappings.manual then category_mappings.subcategory_slug else excluded.subcategory_slug end,
            updated_at = now();
    end if;

    -- 2. Identity: GTIN+condition, else brand+MPN+colour+size+condition, else this retailer's own listing.
    if r->>'gtin' is not null then
      v_identity := 'gtin:' || (r->>'gtin') || '|' || v_cond;
    elsif nullif(r->>'brand','') is not null and nullif(r->>'mpn','') is not null then
      v_identity := 'mpn:' || public.pa_norm(r->>'brand') || '|' || public.pa_norm(r->>'mpn') || '|' ||
                    public.pa_norm(coalesce(r->>'colour','')) || '|' || public.pa_norm(coalesce(r->>'size','')) || '|' || v_cond;
    else
      v_identity := 'src:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'external_id');
    end if;

    select * into v_variant from public.variants where identity_key = v_identity;
    -- Guard: same GTIN but contradicting colour/size => never merge. Keep separate + flag for review.
    if found and v_identity like 'gtin:%' and (public.pa_conflicts(v_variant.colour, r->>'colour') or public.pa_conflicts(v_variant.size, r->>'size')) then
      insert into public.match_reviews (variant_id, reason, detail)
      values (v_variant.id, 'gtin_attribute_conflict', jsonb_build_object(
        'gtin', r->>'gtin', 'existing', jsonb_build_object('colour', v_variant.colour, 'size', v_variant.size, 'title', v_variant.title),
        'incoming', jsonb_build_object('colour', r->>'colour', 'size', r->>'size', 'title', r->>'title', 'retailer', v_ret->>'name', 'external_id', r->>'external_id')));
      v_identity := 'src:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'external_id');
      select * into v_variant from public.variants where identity_key = v_identity;
    end if;

    v_new_variant := not found;
    if v_new_variant then
      -- Family: retailer-provided parent/group id groups colour/size siblings; otherwise one family per variant.
      v_family := case when nullif(r->>'parent_id','') is not null
                       then 'grp:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'parent_id')
                       else 'v:' || v_identity end;
      insert into public.products (family_key, brand, name, mpn, department_slug, subcategory_slug)
      values (v_family, r->>'brand', r->>'family_name', r->>'mpn', v_dept, v_sub)
      on conflict (family_key) do update set updated_at = now()
      returning id into v_product_id;

      v_slug := left(public.pa_slugify(concat_ws(' ', r->>'brand', r->>'title', nullif(r->>'variant_label',''))), 90);
      if v_slug = '' then v_slug := 'product'; end if;
      v_slug := v_slug || '-' || substr(md5(v_identity), 1, 8);

      insert into public.variants (product_id, identity_key, slug, title, brand, mpn, gtin, condition, colour, size, variant_label,
                                   description, specs, keywords, department_slug, subcategory_slug, source_category)
      values (v_product_id, v_identity, v_slug, r->>'title', r->>'brand', r->>'mpn', r->>'gtin', v_cond, r->>'colour', r->>'size',
              coalesce(r->>'variant_label',''), r->>'description', coalesce(r->'specs','{}'::jsonb), coalesce(r->>'keywords',''),
              v_dept, v_sub, r->>'category')
      returning id into v_variant_id;
      n_var := n_var + 1;
    else
      v_variant_id := v_variant.id;
      -- Fill gaps only; never overwrite identity fields from a different retailer.
      update public.variants set
        description = coalesce(variants.description, r->>'description'),
        colour = coalesce(variants.colour, r->>'colour'),
        size = coalesce(variants.size, r->>'size'),
        mpn = coalesce(variants.mpn, r->>'mpn'),
        department_slug = coalesce(case when v_map.manual then v_dept end, variants.department_slug, v_dept),
        subcategory_slug = coalesce(case when v_map.manual then v_sub end, variants.subcategory_slug, v_sub),
        keywords = case when length(variants.keywords) < 400 and position(coalesce(r->>'keywords','') in variants.keywords) = 0
                        then left(variants.keywords || ' ' || coalesce(r->>'keywords',''), 1000) else variants.keywords end,
        updated_at = now()
      where id = v_variant_id;
    end if;
    perform public.pa_refresh_search_doc(v_variant_id);

    -- 3. Images (only https URLs reach this point).
    pos := 0;
    for img in select * from jsonb_array_elements(coalesce(r->'images','[]'::jsonb)) loop
      insert into public.variant_images (variant_id, url, position, source, feed_id, alt)
      values (v_variant_id, img #>> '{}', (select coalesce(max(position)+1, 0) from public.variant_images where variant_id = v_variant_id), v_source, v_feed.id, r->>'title')
      on conflict (variant_id, url) do update set last_seen_at = now();
      pos := pos + 1;
    end loop;

    -- 4. Offer upsert + price history when the price (or shipping) changes.
    select * into v_offer from public.offers where source = v_source and retailer_id = v_retailer_id and external_id = r->>'external_id';
    if not found then
      insert into public.offers (variant_id, retailer_id, feed_id, source, external_id, title_at_source, price_minor, currency, vat_included,
        rrp_minor, ship_from, stock, product_url, click_url, destinations, delivery_time, source_updated_at, last_import_run_id)
      values (v_variant_id, v_retailer_id, v_feed.id, v_source, r->>'external_id', r->>'title', (r->>'price_minor')::bigint, r->>'currency',
        coalesce((r->>'vat_included')::boolean, v_feed.vat_included), (r->>'rrp_minor')::bigint, r->>'ship_from', coalesce(r->>'stock','unknown'),
        r->>'product_url', r->>'click_url', coalesce(r->'destinations','{}'::jsonb), r->>'delivery_time', (r->>'source_updated_at')::timestamptz, v_run)
      returning id into v_offer_id;
      insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id)
      values (v_offer_id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run);
      n_off_new := n_off_new + 1;
    else
      if v_offer.price_minor <> (r->>'price_minor')::bigint or v_offer.currency <> r->>'currency'
         or (v_offer.destinations #>> array[coalesce(r->>'ship_from',''),'shipping','amountMinor']) is distinct from (r->>'home_shipping_minor') then
        insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id)
        values (v_offer.id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run);
      end if;
      update public.offers set
        variant_id = v_variant_id, feed_id = v_feed.id, title_at_source = r->>'title',
        price_minor = (r->>'price_minor')::bigint, currency = r->>'currency',
        vat_included = coalesce((r->>'vat_included')::boolean, v_feed.vat_included),
        rrp_minor = (r->>'rrp_minor')::bigint, ship_from = r->>'ship_from', stock = coalesce(r->>'stock','unknown'),
        product_url = r->>'product_url', click_url = r->>'click_url', destinations = coalesce(r->'destinations','{}'::jsonb),
        delivery_time = r->>'delivery_time', source_updated_at = (r->>'source_updated_at')::timestamptz,
        is_active = true, last_seen_at = now(), last_import_run_id = v_run, updated_at = now()
      where id = v_offer.id;
      n_off_upd := n_off_upd + 1;
    end if;
    n_imported := n_imported + 1;
  end loop;

  update public.import_runs set rows_imported = rows_imported + n_imported, variants_created = variants_created + n_var,
    offers_created = offers_created + n_off_new, offers_updated = offers_updated + n_off_upd
  where id = v_run;

  return jsonb_build_object('imported', n_imported, 'variants_created', n_var, 'offers_created', n_off_new, 'offers_updated', n_off_upd, 'retailer_id', v_retailer_id);
end $$;

create or replace function public.pa_import_log_errors(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare n int;
begin
  insert into public.import_errors (run_id, row_number, external_id, severity, code, message, raw)
  select (p->>'run_id')::uuid, (e->>'row')::int, e->>'external_id', coalesce(e->>'severity','error'), e->>'code', e->>'message', e->'raw'
  from jsonb_array_elements(p->'errors') e;
  get diagnostics n = row_count;
  update public.import_runs set rows_rejected = rows_rejected + (select count(*) from jsonb_array_elements(p->'errors') e where coalesce(e->>'severity','error') = 'error')
  where id = (p->>'run_id')::uuid;
  return jsonb_build_object('logged', n);
end $$;

-- Finish a run. Offers missing from a COMPLETE successful run are deactivated (never on partial/failed runs).
create or replace function public.pa_import_finish(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_run public.import_runs; n_deact int := 0; v_status text := p->>'status';
begin
  select * into v_run from public.import_runs where id = (p->>'run_id')::uuid;
  if not found then raise exception 'run not found'; end if;
  if v_status = 'succeeded' then
    update public.offers set is_active = false, updated_at = now()
     where feed_id = v_run.feed_id and is_active and last_import_run_id is distinct from v_run.id;
    get diagnostics n_deact = row_count;
  end if;
  update public.import_runs set status = v_status, finished_at = now(), rows_total = coalesce((p->>'rows_total')::int, rows_total),
    offers_deactivated = n_deact, message = p->>'message'
  where id = v_run.id;
  update public.feeds set last_status = v_status, last_message = p->>'message', updated_at = now(),
    last_success_at = case when v_status = 'succeeded' then now() else last_success_at end
  where id = v_run.feed_id;
  return jsonb_build_object('status', v_status, 'offers_deactivated', n_deact);
end $$;

create or replace function public.pa_fx_upsert(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare n int;
begin
  insert into public.fx_rates (base, quote, rate, as_of, source)
  select p->>'base', e->>'quote', (e->>'rate')::numeric, (p->>'as_of')::date, p->>'source'
  from jsonb_array_elements(p->'rates') e
  on conflict (base, quote, as_of) do update set rate = excluded.rate, source = excluded.source;
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n);
end $$;

-- =============================================================================
-- REDIRECT (service_role): look up an active offer's permitted URL and log a click.
-- =============================================================================
create or replace function public.pa_offer_redirect(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare o record;
begin
  select o2.id, o2.click_url, o2.product_url, o2.source, o2.is_active, r.website_domain, r.name as retailer
    into o from public.offers o2 join public.retailers r on r.id = o2.retailer_id where o2.id = (p->>'offer_id')::uuid;
  if not found or not o.is_active then return jsonb_build_object('found', false); end if;
  insert into public.click_events (offer_id, from_path) values (o.id, left(p->>'from_path', 200));
  return jsonb_build_object('found', true, 'click_url', o.click_url, 'source', o.source, 'retailer', o.retailer, 'website_domain', o.website_domain);
end $$;

-- =============================================================================
-- PUBLIC CATALOGUE READS (anon) — active data only.
-- =============================================================================
create or replace function public.pa_variant_json(v public.variants) returns jsonb
language sql stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', v.id, 'slug', v.slug, 'name', v.title, 'brand', coalesce(v.brand,''), 'productId', v.product_id,
    'department', coalesce(v.department_slug,''), 'subcategory', coalesce(v.subcategory_slug,''),
    'model', coalesce(v.mpn,''), 'variant', v.variant_label, 'gtin', coalesce(v.gtin,''), 'condition', v.condition,
    'description', coalesce(v.description,''), 'specs', v.specs, 'sourceCategory', v.source_category,
    'images', coalesce((select jsonb_agg(jsonb_build_object('url', i.url, 'alt', coalesce(i.alt, v.title), 'source', i.source, 'licence', i.licence_note) order by i.position)
                        from public.variant_images i where i.variant_id = v.id and i.last_seen_at > now() - interval '30 days'), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'productId', v.id, 'retailerId', r.id,
        'retailer', jsonb_build_object('id', r.id, 'name', r.name, 'country', r.country),
        'price', jsonb_build_object('minor', o.price_minor, 'currency', o.currency),
        'vatIncluded', o.vat_included, 'shipFrom', o.ship_from, 'stock', o.stock, 'destinations', o.destinations,
        'rrp', case when o.rrp_minor is not null then jsonb_build_object('minor', o.rrp_minor, 'currency', o.currency) end,
        'reference', ref.reference,
        'observedAt', o.last_seen_at, 'sourceUpdatedAt', o.source_updated_at, 'deliveryTime', o.delivery_time,
        'clickable', (o.click_url is not null), 'sourceUrl', null, 'source', o.source) order by o.price_minor)
      from public.offers o join public.retailers r on r.id = o.retailer_id
      left join lateral (
        -- Reference price for a discount claim: the lowest price WE observed during the 30 days before today,
        -- only when we have at least 30 days of history for this offer.
        select case when count(*) > 0 and min(po.observed_at) <= now() - interval '30 days' and min(po.price_minor) > o.price_minor
          then jsonb_build_object('price', jsonb_build_object('minor', min(po.price_minor), 'currency', o.currency),
                                  'evidence', 'Lowest price PriceAtlas observed at this retailer in the previous 30 days.') end as reference
        from public.price_observations po
        where po.offer_id = o.id and po.observed_at >= now() - interval '31 days' and po.observed_at < date_trunc('day', now()) and po.currency = o.currency
      ) ref on true
      where o.variant_id = v.id and o.is_active), '[]'::jsonb)
  )
$$;

create or replace function public.pa_catalog_product(p jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare v public.variants; sib jsonb;
begin
  select * into v from public.variants where slug = p->>'slug';
  if not found or not exists (select 1 from public.offers where variant_id = v.id and is_active) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'variant', s.variant_label, 'condition', s.condition, 'name', s.title)), '[]'::jsonb)
    into sib from public.variants s
   where s.product_id = v.product_id and s.id <> v.id and exists (select 1 from public.offers where variant_id = s.id and is_active);
  return public.pa_variant_json(v) || jsonb_build_object('siblings', sib);
end $$;

-- Products by ids (saved items, comparison). Max 50.
create or replace function public.pa_catalog_by_ids(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(public.pa_variant_json(v)), '[]'::jsonb)
  from public.variants v
  where v.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p->'ids','[]'::jsonb)) x limit 50)
    and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
$$;

-- Department / subcategory listing, or a shelf (limit). Products with photos and more offers first.
create or replace function public.pa_catalog_list(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  with base as (
    select v as vrow, v.updated_at,
           (select count(*) from public.offers o where o.variant_id = v.id and o.is_active) as n_offers,
           exists (select 1 from public.variant_images i where i.variant_id = v.id) as has_img
    from public.variants v
    where (p->>'department' is null or v.department_slug = p->>'department')
      and (p->>'subcategory' is null or v.subcategory_slug = p->>'subcategory')
      and (p->>'condition' is null or v.condition = p->>'condition')
  ), live as (select * from base where n_offers > 0)
  select jsonb_build_object(
    'total', (select count(*) from live),
    'items', coalesce((select jsonb_agg(public.pa_variant_json(l.vrow) order by l.has_img desc, l.n_offers desc, l.updated_at desc) from (
        select * from live order by has_img desc, n_offers desc, updated_at desc
        limit least(coalesce((p->>'limit')::int, 24), 100) offset greatest(coalesce((p->>'offset')::int, 0), 0)) l), '[]'::jsonb))
$$;

-- Full-text + trigram (typo-tolerant) search, exact GTIN, filters. Returns up to 240 hits.
create or replace function public.pa_catalog_search(p jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare q text := left(coalesce(p->>'q',''), 120); nq text; tsq tsquery; digits text;
begin
  nq := public.pa_norm(q);
  digits := regexp_replace(q, '\s', '', 'g');
  if digits ~ '^[0-9]{8,14}$' then
    return coalesce((select jsonb_agg(public.pa_variant_json(v)) from public.variants v
      where v.gtin = lpad(digits, 14, '0') and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)), '[]'::jsonb);
  end if;
  if nq = '' then
    return (public.pa_catalog_list(jsonb_build_object('department', p->>'department', 'condition', p->>'condition', 'limit', 240)))->'items';
  end if;
  tsq := (select to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & ')) from regexp_split_to_table(nq, '[^a-z0-9]+') w where w <> '');
  return coalesce((
    select jsonb_agg(public.pa_variant_json(x.v) order by x.score desc) from (
      select v, ts_rank(v.search_doc, tsq) * 2 + extensions.word_similarity(nq, public.pa_norm(v.title || ' ' || coalesce(v.brand,''))) as score
      from public.variants v
      where (v.search_doc @@ tsq or extensions.word_similarity(nq, public.pa_norm(v.title || ' ' || coalesce(v.brand,''))) >= 0.45)
        and (p->>'department' is null or v.department_slug = p->>'department')
        and (p->>'condition' is null or v.condition = p->>'condition')
        and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
      order by score desc limit 240) x), '[]'::jsonb);
end $$;

-- Lightweight autocomplete (no offers payload).
create or replace function public.pa_catalog_suggest(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'label', concat_ws(' ', s.brand, s.title), 'hint', s.variant_label)), '[]'::jsonb)
  from (select v.slug, v.brand, v.title, v.variant_label
        from public.variants v
        where length(coalesce(p->>'q','')) >= 2
          and (public.pa_norm(v.title || ' ' || coalesce(v.brand,'')) like '%' || public.pa_norm(p->>'q') || '%'
               or extensions.word_similarity(public.pa_norm(p->>'q'), public.pa_norm(v.title || ' ' || coalesce(v.brand,''))) >= 0.5)
          and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
        order by extensions.word_similarity(public.pa_norm(p->>'q'), public.pa_norm(v.title || ' ' || coalesce(v.brand,''))) desc
        limit 6) s
$$;

-- Counts per department + overall stats + latest FX rates.
create or replace function public.pa_catalog_meta(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'departments', coalesce((select jsonb_object_agg(d, n) from (
        select v.department_slug d, count(*) n from public.variants v
        where v.department_slug is not null and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
        group by 1) x), '{}'::jsonb),
    'subcategories', coalesce((select jsonb_object_agg(d, n) from (
        select v.department_slug || '/' || v.subcategory_slug d, count(*) n from public.variants v
        where v.subcategory_slug is not null and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
        group by 1) x), '{}'::jsonb),
    'products', (select count(*) from public.variants v where exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)),
    'offers', (select count(*) from public.offers where is_active),
    'retailers', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'country', r.country) order by r.name)
                  from public.retailers r where exists (select 1 from public.offers o where o.retailer_id = r.id and o.is_active)), '[]'::jsonb),
    'fx', (select jsonb_build_object('base', 'EUR', 'asOf', max(as_of), 'source', max(source),
                   'rates', jsonb_object_agg(quote, rate) || jsonb_build_object('EUR', 1))
           from public.fx_rates where base = 'EUR' and as_of = (select max(as_of) from public.fx_rates where base = 'EUR')),
    'stores', (select count(*) from public.stores)
  )
$$;

-- Products whose current price is below our own 30-day observed low (evidence-backed sales).
create or replace function public.pa_catalog_price_drops(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(public.pa_variant_json(v)), '[]'::jsonb) from (
    select distinct v.* from public.variants v
    join public.offers o on o.variant_id = v.id and o.is_active
    where exists (
      select 1 from public.price_observations po where po.offer_id = o.id and po.currency = o.currency
      group by po.offer_id
      having min(po.observed_at) <= now() - interval '30 days'
         and min(po.price_minor) filter (where po.observed_at >= now() - interval '31 days' and po.observed_at < date_trunc('day', now())) > o.price_minor)
    limit least(coalesce((p->>'limit')::int, 12), 48)) v
$$;

-- =============================================================================
-- ADMIN (service_role only)
-- =============================================================================
create or replace function public.pa_admin_overview(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'feeds', coalesce((select jsonb_agg(to_jsonb(f) - 'download_url_template' || jsonb_build_object(
        'has_download_url', f.download_url_template is not null,
        'active_offers', (select count(*) from public.offers o where o.feed_id = f.id and o.is_active),
        'last_run', (select to_jsonb(r) from public.import_runs r where r.feed_id = f.id order by started_at desc limit 1))
      order by f.enabled desc, f.advertiser_name) from public.feeds f), '[]'::jsonb),
    'counts', jsonb_build_object(
      'variants', (select count(*) from public.variants),
      'active_offers', (select count(*) from public.offers where is_active),
      'inactive_offers', (select count(*) from public.offers where not is_active),
      'stale_offers', (select count(*) from public.offers where is_active and last_seen_at < now() - interval '7 days'),
      'missing_photos', (select count(*) from public.variants v where not exists (select 1 from public.variant_images i where i.variant_id = v.id)),
      'open_reviews', (select count(*) from public.match_reviews where status = 'open'),
      'unmapped_categories', (select count(*) from public.category_mappings where department_slug is null),
      'clicks_7d', (select count(*) from public.click_events where created_at > now() - interval '7 days')),
    'recent_runs', coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('feed_name', f.advertiser_name) order by r.started_at desc)
                    from (select * from public.import_runs order by started_at desc limit 15) r join public.feeds f on f.id = r.feed_id), '[]'::jsonb)
  )
$$;

create or replace function public.pa_admin_feed_get(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$ select to_jsonb(f) from public.feeds f where f.id = (p->>'feed_id')::uuid $$;

create or replace function public.pa_admin_feeds_due(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.feeds f
  where f.enabled and (coalesce((p->>'force')::boolean, false) or f.last_success_at is null or f.last_success_at < now() - make_interval(hours => f.refresh_hours))
$$;

-- Register/refresh feeds discovered from the provider's feed list (never enables them).
create or replace function public.pa_admin_feeds_upsert(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare n int;
begin
  insert into public.feeds (provider, external_feed_id, advertiser_id, advertiser_name, name, country, language, currency,
                            download_url_template, membership_status, provider_last_imported_at)
  select p->>'provider', e->>'external_feed_id', e->>'advertiser_id', e->>'advertiser_name', e->>'name', e->>'country',
         e->>'language', e->>'currency', e->>'download_url_template', e->>'membership_status', (e->>'provider_last_imported_at')::timestamptz
  from jsonb_array_elements(p->'feeds') e
  on conflict (provider, external_feed_id) do update set
    advertiser_name = excluded.advertiser_name, name = excluded.name, country = coalesce(excluded.country, feeds.country),
    language = excluded.language, currency = coalesce(excluded.currency, feeds.currency),
    download_url_template = coalesce(excluded.download_url_template, feeds.download_url_template),
    membership_status = excluded.membership_status, provider_last_imported_at = excluded.provider_last_imported_at, updated_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('upserted', n);
end $$;

-- Enable/disable a feed. Safety: only `max_enabled` feeds may be enabled, and a second feed can only be
-- enabled after at least one feed has completed a successful import (test one retailer first).
create or replace function public.pa_admin_feed_update(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare f public.feeds; n_enabled int; n_ok int;
begin
  select * into f from public.feeds where id = (p->>'feed_id')::uuid;
  if not found then return jsonb_build_object('ok', false, 'error', 'Feed not found'); end if;
  if (p->>'enabled')::boolean is true and not f.enabled then
    if f.country is null or f.country not in (select jsonb_array_elements_text(p->'supported_countries')) then
      return jsonb_build_object('ok', false, 'error', 'This feed''s country is not supported yet. Set a supported country first.');
    end if;
    select count(*) into n_enabled from public.feeds where enabled;
    select count(*) into n_ok from public.feeds where last_success_at is not null;
    if n_enabled >= coalesce((p->>'max_enabled')::int, 1) then
      return jsonb_build_object('ok', false, 'error', format('Limit reached: %s feed(s) may be enabled (AWIN_MAX_ENABLED_FEEDS).', coalesce((p->>'max_enabled')::int, 1)));
    end if;
    if n_enabled >= 1 and n_ok = 0 then
      return jsonb_build_object('ok', false, 'error', 'Run one feed successfully before enabling another.');
    end if;
  end if;
  update public.feeds set
    enabled = coalesce((p->>'enabled')::boolean, enabled),
    refresh_hours = coalesce((p->>'refresh_hours')::int, refresh_hours),
    country = coalesce(p->>'country', country),
    currency = coalesce(p->>'currency', currency),
    vat_included = coalesce((p->>'vat_included')::boolean, vat_included),
    download_url_template = coalesce(p->>'download_url_template', download_url_template),
    updated_at = now()
  where id = f.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pa_admin_run(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'run', (select to_jsonb(r) || jsonb_build_object('feed_name', f.advertiser_name) from public.import_runs r join public.feeds f on f.id = r.feed_id where r.id = (p->>'run_id')::uuid),
    'errors', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from (select * from public.import_errors where run_id = (p->>'run_id')::uuid order by id limit 500) e), '[]'::jsonb),
    'error_summary', coalesce((select jsonb_object_agg(code, n) from (select code, count(*) n from public.import_errors where run_id = (p->>'run_id')::uuid group by code) s), '{}'::jsonb))
$$;

create or replace function public.pa_admin_issues(p jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare k text := p->>'kind'; lim int := least(coalesce((p->>'limit')::int, 100), 500);
begin
  if k = 'stale' then
    return coalesce((select jsonb_agg(x) from (select o.id, v.title, v.slug, r.name retailer, o.last_seen_at, o.price_minor, o.currency
      from public.offers o join public.variants v on v.id = o.variant_id join public.retailers r on r.id = o.retailer_id
      where o.is_active and o.last_seen_at < now() - interval '7 days' order by o.last_seen_at limit lim) x), '[]'::jsonb);
  elsif k = 'missing_photos' then
    return coalesce((select jsonb_agg(x) from (select v.id, v.title, v.slug, v.brand, v.gtin
      from public.variants v where not exists (select 1 from public.variant_images i where i.variant_id = v.id)
      order by v.updated_at desc limit lim) x), '[]'::jsonb);
  elsif k = 'reviews' then
    return coalesce((select jsonb_agg(x) from (select m.id, m.reason, m.detail, m.status, m.created_at, v.title, v.slug
      from public.match_reviews m left join public.variants v on v.id = m.variant_id where m.status = 'open' order by m.created_at desc limit lim) x), '[]'::jsonb);
  elsif k = 'duplicates' then
    -- Possible duplicates: same brand + same normalised title but different identities. Never merged automatically.
    return coalesce((select jsonb_agg(x) from (
      select public.pa_norm(v.brand) brand, public.pa_norm(v.title) title, count(*) n,
             jsonb_agg(jsonb_build_object('slug', v.slug, 'gtin', v.gtin, 'mpn', v.mpn, 'variant', v.variant_label, 'condition', v.condition, 'identity', v.identity_key)) items
      from public.variants v group by 1, 2 having count(*) > 1 order by count(*) desc limit lim) x), '[]'::jsonb);
  elsif k = 'categories' then
    return coalesce((select jsonb_agg(x) from (select id, source, source_category, department_slug, subcategory_slug, manual, product_count
      from public.category_mappings order by (department_slug is null) desc, product_count desc limit lim) x), '[]'::jsonb);
  end if;
  return '[]'::jsonb;
end $$;

create or replace function public.pa_admin_review_set(p jsonb) returns jsonb
language sql security definer
set search_path = public, extensions
as $$
  update public.match_reviews set status = p->>'status' where id = (p->>'id')::uuid and p->>'status' in ('resolved','dismissed');
  select jsonb_build_object('ok', true);
$$;

create or replace function public.pa_admin_category_set(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare m public.category_mappings;
begin
  update public.category_mappings set department_slug = nullif(p->>'department_slug',''), subcategory_slug = nullif(p->>'subcategory_slug',''),
         manual = true, updated_at = now()
   where id = (p->>'id')::uuid returning * into m;
  if not found then return jsonb_build_object('ok', false); end if;
  update public.variants set department_slug = m.department_slug, subcategory_slug = m.subcategory_slug, updated_at = now()
   where source_category = m.source_category;
  return jsonb_build_object('ok', true);
end $$;

-- =============================================================================
-- Function permissions
-- =============================================================================
do $$
declare fn text;
begin
  foreach fn in array array['pa_import_start','pa_import_batch','pa_import_log_errors','pa_import_finish','pa_fx_upsert','pa_offer_redirect',
    'pa_admin_overview','pa_admin_feed_get','pa_admin_feeds_due','pa_admin_feeds_upsert','pa_admin_feed_update','pa_admin_run','pa_admin_issues',
    'pa_admin_review_set','pa_admin_category_set']
  loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated', fn);
    execute format('grant execute on function public.%I(jsonb) to service_role', fn);
  end loop;
  foreach fn in array array['pa_catalog_product','pa_catalog_by_ids','pa_catalog_list','pa_catalog_search','pa_catalog_suggest','pa_catalog_meta','pa_catalog_price_drops']
  loop
    execute format('revoke all on function public.%I(jsonb) from public', fn);
    execute format('grant execute on function public.%I(jsonb) to anon, authenticated, service_role', fn);
  end loop;
end $$;
revoke all on function public.pa_variant_json(public.variants) from public, anon, authenticated;
revoke all on function public.pa_refresh_search_doc(uuid) from public, anon, authenticated;
-- ============================ END 20261024120000_catalog.sql ==============================

-- ============================ BEGIN 20261025120000_local_offers_price_history.sql ============================
-- PriceViva v0.6 — additive migration (no data is changed or removed).
--  * Local Deal Radar: store website/external id, per-store availability + freshness, and a public read
--    function that returns only merchant-supplied or verified offers inside a radius.
--  * Price history: a public read function over the observations the importer already records.

alter table public.stores add column if not exists external_id text;
alter table public.stores add column if not exists website_url text check (website_url is null or website_url ~ '^https://');
create unique index if not exists stores_retailer_external_idx on public.stores (retailer_id, external_id) where external_id is not null;

alter table public.promotion_stores add column if not exists availability text not null default 'unknown'
  check (availability in ('in_stock','limited','out_of_stock','unknown'));
alter table public.promotion_stores add column if not exists observed_at timestamptz;

-- Offers within p.radius_km of (p.lat, p.lng). Rejected promotions never appear; pending ones are labelled
-- "merchant" (supplied, not yet checked) and verified ones "verified". Distance uses the store's real coordinates.
create or replace function public.pa_catalog_local_offers(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  with params as (
    select (p->>'lat')::float8 as lat, (p->>'lng')::float8 as lng, least(greatest(coalesce((p->>'radius_km')::float8, 10), 1), 100) as r
  ), rows as (
    select pr.*, s.id as store_id, s.name as store_name, s.address_line, s.postal_code, s.city, s.country as store_country,
           s.lat as s_lat, s.lng as s_lng, s.website_url, ps.availability, ps.observed_at, r.name as retailer_name,
           v.slug as variant_slug, v.title as variant_title,
           2 * 6371 * asin(least(1, sqrt(power(sin(radians(s.lat - params.lat) / 2), 2)
             + cos(radians(params.lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - params.lng) / 2), 2)))) as km
    from params, public.promotions pr
    join public.promotion_stores ps on ps.promotion_id = pr.id
    join public.stores s on s.id = ps.store_id
    join public.retailers r on r.id = pr.retailer_id
    left join public.variants v on v.id = pr.variant_id
    where pr.verification in ('pending', 'verified') and pr.ends_at > now()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', rows.id::text || '@' || rows.store_id::text,
      'store', jsonb_build_object('id', rows.store_id, 'retailerName', rows.retailer_name, 'name', rows.store_name,
         'address', concat_ws(', ', rows.address_line, nullif(concat_ws(' ', rows.postal_code, rows.city), '')),
         'city', rows.city, 'lat', rows.s_lat, 'lng', rows.s_lng, 'website', rows.website_url,
         'status', case when rows.verification = 'verified' then 'verified' else 'merchant' end),
      'title', rows.title, 'productName', rows.variant_title, 'productSlug', rows.variant_slug, 'departmentSlug', rows.department_slug,
      'price', case when rows.promo_price_minor is not null then jsonb_build_object('minor', rows.promo_price_minor, 'currency', rows.currency) end,
      'reference', case when rows.reference_price_minor is not null and rows.reference_evidence is not null
                   then jsonb_build_object('price', jsonb_build_object('minor', rows.reference_price_minor, 'currency', rows.currency), 'evidence', rows.reference_evidence) end,
      'validFrom', rows.starts_at, 'validTo', rows.ends_at,
      'timing', case when rows.starts_at > now() then 'upcoming' else 'active' end,
      'availability', rows.availability, 'scope', rows.scope, 'pickup', rows.pickup, 'terms', rows.terms,
      'distanceKm', round(rows.km::numeric, 2),
      'status', case when rows.verification = 'verified' then 'verified' else 'merchant' end,
      'updatedAt', rows.observed_at
    ) order by rows.km), '[]'::jsonb)
  from rows, params where rows.km <= params.r
$$;

-- Recorded price observations for one variant (by slug or id), newest last, at most 2 years / 2000 points.
create or replace function public.pa_catalog_price_history(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'offerId', o.id, 'retailer', r.name, 'retailerCountry', r.country,
      'observedAt', po.observed_at, 'priceMinor', po.price_minor, 'currency', po.currency, 'shippingMinor', po.shipping_minor,
      'source', 'awin'
    ) order by po.observed_at), '[]'::jsonb)
  from public.variants v
  join public.offers o on o.variant_id = v.id
  join public.retailers r on r.id = o.retailer_id
  join public.price_observations po on po.offer_id = o.id
  where (v.slug = p->>'slug' or v.id::text = p->>'id')
    and po.observed_at > now() - interval '730 days'
    and po.id in (select id from public.price_observations x where x.offer_id = o.id order by x.observed_at desc limit 2000)
$$;

do $$
declare fn text;
begin
  foreach fn in array array['pa_catalog_local_offers', 'pa_catalog_price_history']
  loop
    execute format('revoke all on function public.%I(jsonb) from public', fn);
    execute format('grant execute on function public.%I(jsonb) to anon, authenticated, service_role', fn);
  end loop;
end $$;
-- ============================ END 20261025120000_local_offers_price_history.sql ==============================

-- ============================ BEGIN 20261026120000_lock_helper_functions.sql ============================
-- =============================================================================
-- PriceViva v0.7: lock down the internal helper functions.
-- Supabase gives anon/authenticated EXECUTE on new functions by default. These helpers are only needed inside the
-- database (search index and the security-definer pa_* functions, which run as their owner), so the public API
-- should not expose them. Additive and safe to run more than once; changes no data.
-- =============================================================================
revoke all on function public.pa_norm(text) from public, anon, authenticated;
revoke all on function public.pa_slugify(text) from public, anon, authenticated;
revoke all on function public.pa_conflicts(text, text) from public, anon, authenticated;
-- ============================ END 20261026120000_lock_helper_functions.sql ==============================

-- ============================ BEGIN 20261026130000_accounts.sql ============================
-- =============================================================================
-- PriceViva accounts: saved products and price alerts for signed-in users (Supabase Auth).
-- Additive only: creates 3 tables and 6 functions; changes no existing data. Safe to run more than once.
--
-- Privacy and security:
--   * Passwords are handled only by Supabase Auth (auth.users). No password is ever stored here.
--   * Private rows carry user_id and are protected by row-level security: user_id = auth.uid().
--     Signed-in users can only see and change their own rows; the public (anon) key has no access at all.
--   * Deleting a user in Supabase Auth deletes their saved products, alerts and alert events (on delete cascade).
--   * price_alert_events and the pa_alert_* functions are server-only (secret key), for the e-mail worker.
--   * Signed-in users may only change the alert fields they own (target, currency, pause, e-mail on/off, names).
--     Server-managed fields (email_notified_*, created_at, updated_at, user_id, product, destination) are protected
--     twice: by column-level privileges and by the trigger pa_alerts_guard (which also keeps them correct).
--
-- Re-runs: every statement is idempotent, and re-running TIGHTENS permissions an earlier version granted
-- (table-level privileges are revoked and re-granted per column; our own policies are re-written in place).
-- =============================================================================

-- Pre-check: stop with a clear message, before changing anything, if a table with one of these names already
-- exists but is not PriceViva's (e.g. left over from another website). Nothing is dropped or altered here.
do $pv$
declare
  need jsonb := '{
    "user_saved_products": ["user_id","product_id","created_at"],
    "price_alerts": ["user_id","id","product_id","product_name","product_slug","target_minor","currency","destination","paused","email_enabled","email_notified_minor","email_notified_at","created_at","updated_at"],
    "price_alert_events": ["id","user_id","alert_id","price_minor","currency","retailer","status","detail","created_at","sent_at"]
  }';
  t text;
  missing text;
begin
  for t in select jsonb_object_keys(need) loop
    if to_regclass('public.' || t) is not null then
      select string_agg(c, ', ') into missing
        from jsonb_array_elements_text(need -> t) as c
       where not exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = t and column_name = c);
      if missing is not null then
        raise exception 'public.% already exists but is not PriceViva''s accounts table (missing columns: %). Nothing was changed. Send this message to Claude.', t, missing;
      end if;
    end if;
  end loop;
end $pv$;

create table if not exists public.user_saved_products (
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  text not null check (char_length(product_id) between 1 and 64),
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.price_alerts (
  user_id               uuid not null references auth.users(id) on delete cascade,
  id                    text not null check (id ~ '^[A-Za-z0-9-]{1,40}$'),
  product_id            text not null check (char_length(product_id) between 1 and 64),
  product_name          text not null check (char_length(product_name) between 1 and 200),
  product_slug          text not null check (char_length(product_slug) between 1 and 200),
  target_minor          bigint not null check (target_minor > 0 and target_minor < 1000000000000),
  currency              text not null check (currency in ('SEK','EUR','GBP','USD','NOK','DKK','CHF','CAD','AUD','JPY')),
  destination           text not null check (destination in ('SE','DE','GB')),
  paused                boolean not null default false,
  -- E-mail for this alert (the user can switch it off, also from the unsubscribe link in every alert e-mail).
  email_enabled         boolean not null default true,
  -- Set only by the server-side e-mail worker: the price we last e-mailed about (prevents duplicate e-mails).
  email_notified_minor  bigint,
  email_notified_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, product_id, destination)
);
create index if not exists price_alerts_product_idx on public.price_alerts (product_id) where not paused and email_enabled;

-- Server-only log of price-drop e-mails (delivery status, errors). Never readable through the public API.
create table if not exists public.price_alert_events (
  id            uuid primary key default extensions.gen_random_uuid(),
  user_id       uuid not null,
  alert_id      text not null,
  price_minor   bigint not null,
  currency      text not null,
  retailer      text,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  detail        text check (detail is null or char_length(detail) <= 500),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  foreign key (user_id, alert_id) references public.price_alerts (user_id, id) on delete cascade
);
create index if not exists price_alert_events_alert_idx on public.price_alert_events (user_id, alert_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Row-level security and table permissions
-- -----------------------------------------------------------------------------
alter table public.user_saved_products enable row level security;
alter table public.price_alerts enable row level security;
alter table public.price_alert_events enable row level security;

-- Supabase grants everything on new tables to anon/authenticated by default: start from nothing. Revoking at table
-- level also removes any column-level privileges, so a re-run always ends in exactly the state below.
revoke all on public.user_saved_products, public.price_alerts, public.price_alert_events from public, anon, authenticated;

-- Saved products: read, add (only these two columns; created_at is set by the database), remove. No update.
grant select, delete on public.user_saved_products to authenticated;
grant insert (user_id, product_id) on public.user_saved_products to authenticated;

-- Alerts: read and delete own rows; insert and update ONLY the fields a customer manages.
-- Not writable by customers: email_notified_minor, email_notified_at (e-mail worker), created_at, updated_at
-- (database), and on update also user_id, id, product_id, destination (an alert stays the same alert).
grant select, delete on public.price_alerts to authenticated;
grant insert (user_id, id, product_id, product_name, product_slug, target_minor, currency, destination, paused, email_enabled)
  on public.price_alerts to authenticated;
grant update (product_name, product_slug, target_minor, currency, paused, email_enabled)
  on public.price_alerts to authenticated;
-- price_alert_events: no grants (server-only through security-definer functions).

-- Guard trigger (defence in depth, and keeps server fields correct): for signed-in users and the public key, the
-- server-managed fields can never be set or changed directly. A new target or currency clears the e-mail state so
-- the new target can notify. The e-mail worker's functions run as the table owner and are not restricted.
create or replace function public.pa_alerts_guard() returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.email_notified_minor := null;
      new.email_notified_at := null;
      new.created_at := now();
    else
      new.user_id := old.user_id;
      new.id := old.id;
      new.product_id := old.product_id;
      new.destination := old.destination;
      new.created_at := old.created_at;
      new.email_notified_minor := old.email_notified_minor;
      new.email_notified_at := old.email_notified_at;
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.target_minor is distinct from old.target_minor or new.currency is distinct from old.currency) then
    new.email_notified_minor := null;
    new.email_notified_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.pa_alerts_guard() from public, anon, authenticated;
create or replace trigger pa_alerts_guard
  before insert or update on public.price_alerts
  for each row execute function public.pa_alerts_guard();

do $pv$
declare pol record;
begin
  for pol in
    select * from (values
      ('user_saved_products', 'own saved products: read',   'select', 'using (user_id = (select auth.uid()))'),
      ('user_saved_products', 'own saved products: add',    'insert', 'with check (user_id = (select auth.uid()))'),
      ('user_saved_products', 'own saved products: remove', 'delete', 'using (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: read',   'select', 'using (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: add',    'insert', 'with check (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: change', 'update', 'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: remove', 'delete', 'using (user_id = (select auth.uid()))')
    ) as v(tbl, name, cmd, expr)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = pol.tbl and policyname = pol.name) then
      execute format('create policy %I on public.%I for %s to authenticated %s', pol.name, pol.tbl, pol.cmd, pol.expr);
    else
      -- Re-run: make sure our own policy has exactly this definition (an older version can't stay looser).
      execute format('alter policy %I on public.%I to authenticated %s', pol.name, pol.tbl, pol.expr);
    end if;
  end loop;
end $pv$;

-- -----------------------------------------------------------------------------
-- Signed-in user functions (SECURITY INVOKER: they run as the user, so row-level security applies)
-- -----------------------------------------------------------------------------
create or replace function public.pa_me_data(p jsonb) returns jsonb
language sql stable security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'saved', coalesce((select jsonb_agg(s.product_id order by s.created_at) from public.user_saved_products s
                        where s.user_id = (select auth.uid())), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'productId', a.product_id, 'productName', a.product_name, 'productSlug', a.product_slug,
        'targetMinor', a.target_minor, 'currency', a.currency, 'destination', a.destination, 'paused', a.paused,
        'emailEnabled', a.email_enabled, 'emailNotifiedMinor', a.email_notified_minor, 'emailNotifiedAt', a.email_notified_at,
        'createdAt', a.created_at) order by a.created_at)
      from public.price_alerts a where a.user_id = (select auth.uid())), '[]'::jsonb)
  )
$$;

-- Applies the browser's changes: {saved_add:[ids], saved_remove:[ids], alerts_upsert:[alert], alerts_remove:[ids]}.
-- Returns the user's full data afterwards. Limits: 200 saved products, 50 alerts.
create or replace function public.pa_me_sync(p jsonb) returns jsonb
language plpgsql security invoker
set search_path = public, extensions
as $$
declare
  uid uuid := (select auth.uid());
  a jsonb;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if jsonb_typeof(coalesce(p->'saved_add', '[]')) <> 'array' or jsonb_typeof(coalesce(p->'saved_remove', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p->'alerts_upsert', '[]')) <> 'array' or jsonb_typeof(coalesce(p->'alerts_remove', '[]')) <> 'array' then
    raise exception 'Invalid request.' using errcode = '22023';
  end if;

  delete from public.user_saved_products
   where user_id = uid and product_id in (select jsonb_array_elements_text(coalesce(p->'saved_remove', '[]')));
  insert into public.user_saved_products (user_id, product_id)
  select uid, x from jsonb_array_elements_text(coalesce(p->'saved_add', '[]')) as x
   where char_length(x) between 1 and 64
  on conflict do nothing;
  if (select count(*) from public.user_saved_products where user_id = uid) > 200 then
    raise exception 'You can save up to 200 products.' using errcode = '54000';
  end if;

  delete from public.price_alerts
   where user_id = uid and id in (select jsonb_array_elements_text(coalesce(p->'alerts_remove', '[]')));
  for a in select * from jsonb_array_elements(coalesce(p->'alerts_upsert', '[]')) loop
    -- One alert per product and delivery country: a newer alert replaces an older one from another device.
    delete from public.price_alerts
     where user_id = uid and product_id = a->>'productId' and destination = a->>'destination' and id <> a->>'id';
    insert into public.price_alerts (user_id, id, product_id, product_name, product_slug, target_minor, currency, destination, paused, email_enabled)
    values (uid, a->>'id', a->>'productId', left(a->>'productName', 200), left(a->>'productSlug', 200), (a->>'targetMinor')::bigint,
            a->>'currency', a->>'destination', coalesce((a->>'paused')::boolean, false), coalesce((a->>'emailEnabled')::boolean, true))
    on conflict (user_id, id) do update set
      product_name = excluded.product_name,
      product_slug = excluded.product_slug,
      target_minor = excluded.target_minor,
      currency     = excluded.currency,
      paused       = excluded.paused,
      email_enabled = excluded.email_enabled;
      -- (pa_alerts_guard clears the e-mail state when the target or currency changes, and sets updated_at.)
  end loop;
  if (select count(*) from public.price_alerts where user_id = uid) > 50 then
    raise exception 'You can have up to 50 price alerts.' using errcode = '54000';
  end if;

  return public.pa_me_data('{}'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- Server-only functions for the price-alert e-mail worker (secret key only)
-- -----------------------------------------------------------------------------
-- Alerts that may need an e-mail: active, e-mail on, and the account's e-mail address confirmed.
create or replace function public.pa_alerts_due(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(x order by x->>'createdAt'), '[]'::jsonb) from (
    select jsonb_build_object(
      'userId', a.user_id, 'id', a.id, 'productId', a.product_id, 'productName', a.product_name, 'productSlug', a.product_slug,
      'targetMinor', a.target_minor, 'currency', a.currency, 'destination', a.destination,
      'emailNotifiedMinor', a.email_notified_minor, 'email', u.email, 'createdAt', a.created_at) as x
    from public.price_alerts a
    join auth.users u on u.id = a.user_id
    where not a.paused and a.email_enabled and u.email is not null and u.email_confirmed_at is not null
    order by a.created_at
    limit least(greatest(coalesce((p->>'limit')::int, 500), 1), 2000)
  ) s
$$;

-- Records what the worker saw for one alert. Atomic, so two workers can never e-mail the same drop twice:
--   best above target -> reset (a later drop may notify again); best at/below target and lower than the last
--   e-mailed price -> 'notify' with a new pending event; otherwise 'none'.
create or replace function public.pa_alert_observe(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  best bigint := (p->>'best_minor')::bigint;
  a public.price_alerts;
  ev uuid;
begin
  select * into a from public.price_alerts where user_id = (p->>'user_id')::uuid and id = p->>'alert_id' for update;
  if not found or best is null then return jsonb_build_object('action', 'none'); end if;
  if best > a.target_minor then
    if a.email_notified_minor is not null then
      update public.price_alerts set email_notified_minor = null, email_notified_at = null where user_id = a.user_id and id = a.id;
      return jsonb_build_object('action', 'reset');
    end if;
    return jsonb_build_object('action', 'none');
  end if;
  if a.paused or not a.email_enabled or (a.email_notified_minor is not null and best >= a.email_notified_minor) then
    return jsonb_build_object('action', 'none');
  end if;
  update public.price_alerts set email_notified_minor = best, email_notified_at = now() where user_id = a.user_id and id = a.id;
  insert into public.price_alert_events (user_id, alert_id, price_minor, currency, retailer)
  values (a.user_id, a.id, best, a.currency, left(p->>'retailer', 200)) returning id into ev;
  return jsonb_build_object('action', 'notify', 'event_id', ev);
end $$;

create or replace function public.pa_alert_event_update(p jsonb) returns jsonb
language sql security definer
set search_path = public, extensions
as $$
  update public.price_alert_events
     set status = p->>'status', detail = left(p->>'detail', 500), sent_at = case when p->>'status' = 'sent' then now() else sent_at end
   where id = (p->>'event_id')::uuid and p->>'status' in ('sent', 'failed', 'skipped')
  returning jsonb_build_object('ok', true)
$$;

-- Unsubscribe link in alert e-mails (the link is signed by the server): switches e-mail off for that alert.
create or replace function public.pa_alert_unsubscribe(p jsonb) returns jsonb
language sql security definer
set search_path = public, extensions
as $$
  with u as (
    update public.price_alerts set email_enabled = false, updated_at = now()
     where user_id = (p->>'user_id')::uuid and id = p->>'alert_id'
    returning product_name
  )
  select coalesce((select jsonb_build_object('ok', true, 'productName', product_name) from u), jsonb_build_object('ok', false))
$$;

-- -----------------------------------------------------------------------------
-- Function permissions
-- -----------------------------------------------------------------------------
do $pv$
declare fn text;
begin
  foreach fn in array array['pa_me_data', 'pa_me_sync'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon', fn);
    execute format('grant execute on function public.%I(jsonb) to authenticated', fn);
  end loop;
  foreach fn in array array['pa_alerts_due', 'pa_alert_observe', 'pa_alert_event_update', 'pa_alert_unsubscribe'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated', fn);
    execute format('grant execute on function public.%I(jsonb) to service_role', fn);
  end loop;
end $pv$;
-- ============================ END 20261026130000_accounts.sql ==============================

-- ============================ BEGIN 20261027120000_category_reclassification.sql ============================
create or replace function public.pa_import_batch(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_run uuid := (p->>'run_id')::uuid;
  v_feed public.feeds;
  v_source text := p->>'source';
  v_ret jsonb := p->'retailer';
  v_retailer_id uuid;
  r jsonb;
  img jsonb;
  v_identity text;
  v_family text;
  v_product_id uuid;
  v_variant public.variants;
  v_variant_id uuid;
  v_offer public.offers;
  v_offer_id uuid;
  v_dept text; v_sub text;
  v_map public.category_mappings;
  v_slug text;
  v_cond text;
  v_new_variant boolean;
  n_imported int := 0; n_var int := 0; n_off_new int := 0; n_off_upd int := 0;
  pos int;
begin
  select * into v_feed from public.feeds where id = (p->>'feed_id')::uuid;
  if not found then raise exception 'feed not found'; end if;

  insert into public.retailers (source, external_id, name, country, website_domain)
  values (v_source, v_ret->>'external_id', v_ret->>'name', v_ret->>'country', v_ret->>'website_domain')
  on conflict (source, external_id) do update
    set name = excluded.name, country = coalesce(excluded.country, retailers.country),
        website_domain = coalesce(excluded.website_domain, retailers.website_domain), updated_at = now()
  returning id into v_retailer_id;

for r in select * from jsonb_array_elements(p->'rows') loop
  v_map := null;
  v_cond := coalesce(r->>'condition', 'new');

    -- 1. Department: a manual admin mapping wins over the importer's automatic guess.
    v_dept := r->>'department_slug'; v_sub := r->>'subcategory_slug';
    if r->>'category' is not null then
      select * into v_map from public.category_mappings where source = v_source and source_category = r->>'category';
      if found and v_map.manual then v_dept := v_map.department_slug; v_sub := v_map.subcategory_slug; end if;
      insert into public.category_mappings (source, source_category, department_slug, subcategory_slug, product_count)
      values (v_source, r->>'category', v_dept, v_sub, 1)
      on conflict (source, source_category) do update
        set product_count = category_mappings.product_count + 1,
            department_slug = case when category_mappings.manual then category_mappings.department_slug else excluded.department_slug end,
            subcategory_slug = case when category_mappings.manual then category_mappings.subcategory_slug else excluded.subcategory_slug end,
            updated_at = now();
    end if;

    -- 2. Identity: GTIN+condition, else brand+MPN+colour+size+condition, else this retailer's own listing.
    if r->>'gtin' is not null then
      v_identity := 'gtin:' || (r->>'gtin') || '|' || v_cond;
    elsif nullif(r->>'brand','') is not null and nullif(r->>'mpn','') is not null then
      v_identity := 'mpn:' || public.pa_norm(r->>'brand') || '|' || public.pa_norm(r->>'mpn') || '|' ||
                    public.pa_norm(coalesce(r->>'colour','')) || '|' || public.pa_norm(coalesce(r->>'size','')) || '|' || v_cond;
    else
      v_identity := 'src:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'external_id');
    end if;

    select * into v_variant from public.variants where identity_key = v_identity;
    -- Guard: same GTIN but contradicting colour/size => never merge. Keep separate + flag for review.
    if found and v_identity like 'gtin:%' and (public.pa_conflicts(v_variant.colour, r->>'colour') or public.pa_conflicts(v_variant.size, r->>'size')) then
      insert into public.match_reviews (variant_id, reason, detail)
      values (v_variant.id, 'gtin_attribute_conflict', jsonb_build_object(
        'gtin', r->>'gtin', 'existing', jsonb_build_object('colour', v_variant.colour, 'size', v_variant.size, 'title', v_variant.title),
        'incoming', jsonb_build_object('colour', r->>'colour', 'size', r->>'size', 'title', r->>'title', 'retailer', v_ret->>'name', 'external_id', r->>'external_id')));
      v_identity := 'src:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'external_id');
      select * into v_variant from public.variants where identity_key = v_identity;
    end if;

    v_new_variant := not found;
    if v_new_variant then
      -- Family: retailer-provided parent/group id groups colour/size siblings; otherwise one family per variant.
      v_family := case when nullif(r->>'parent_id','') is not null
                       then 'grp:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'parent_id')
                       else 'v:' || v_identity end;
      insert into public.products (family_key, brand, name, mpn, department_slug, subcategory_slug)
      values (v_family, r->>'brand', r->>'family_name', r->>'mpn', v_dept, v_sub)
      on conflict (family_key) do update set updated_at = now()
      returning id into v_product_id;

      v_slug := left(public.pa_slugify(concat_ws(' ', r->>'brand', r->>'title', nullif(r->>'variant_label',''))), 90);
      if v_slug = '' then v_slug := 'product'; end if;
      v_slug := v_slug || '-' || substr(md5(v_identity), 1, 8);

      insert into public.variants (product_id, identity_key, slug, title, brand, mpn, gtin, condition, colour, size, variant_label,
                                   description, specs, keywords, department_slug, subcategory_slug, source_category)
      values (v_product_id, v_identity, v_slug, r->>'title', r->>'brand', r->>'mpn', r->>'gtin', v_cond, r->>'colour', r->>'size',
              coalesce(r->>'variant_label',''), r->>'description', coalesce(r->'specs','{}'::jsonb), coalesce(r->>'keywords',''),
              v_dept, v_sub, r->>'category')
      returning id into v_variant_id;
      n_var := n_var + 1;
    else
      v_variant_id := v_variant.id;
      -- Fill gaps only; never overwrite identity fields from a different retailer.
      update public.variants set
        description = coalesce(variants.description, r->>'description'),
        colour = coalesce(variants.colour, r->>'colour'),
        size = coalesce(variants.size, r->>'size'),
        mpn = coalesce(variants.mpn, r->>'mpn'),
        department_slug = case
          when coalesce(v_map.manual, false) then v_dept
          else coalesce(v_dept, variants.department_slug)
        end,
        subcategory_slug = case
          when coalesce(v_map.manual, false) then v_sub
          when v_dept is not null then v_sub
          else variants.subcategory_slug
        end,
        keywords = case when length(variants.keywords) < 400 and position(coalesce(r->>'keywords','') in variants.keywords) = 0
                        then left(variants.keywords || ' ' || coalesce(r->>'keywords',''), 1000) else variants.keywords end,
        updated_at = now()
      where id = v_variant_id;
    end if;
    perform public.pa_refresh_search_doc(v_variant_id);

    -- 3. Images (only https URLs reach this point).
    pos := 0;
    for img in select * from jsonb_array_elements(coalesce(r->'images','[]'::jsonb)) loop
      insert into public.variant_images (variant_id, url, position, source, feed_id, alt)
      values (v_variant_id, img #>> '{}', (select coalesce(max(position)+1, 0) from public.variant_images where variant_id = v_variant_id), v_source, v_feed.id, r->>'title')
      on conflict (variant_id, url) do update set last_seen_at = now();
      pos := pos + 1;
    end loop;

    -- 4. Offer upsert + price history when the price (or shipping) changes.
    select * into v_offer from public.offers where source = v_source and retailer_id = v_retailer_id and external_id = r->>'external_id';
    if not found then
      insert into public.offers (variant_id, retailer_id, feed_id, source, external_id, title_at_source, price_minor, currency, vat_included,
        rrp_minor, ship_from, stock, product_url, click_url, destinations, delivery_time, source_updated_at, last_import_run_id)
      values (v_variant_id, v_retailer_id, v_feed.id, v_source, r->>'external_id', r->>'title', (r->>'price_minor')::bigint, r->>'currency',
        coalesce((r->>'vat_included')::boolean, v_feed.vat_included), (r->>'rrp_minor')::bigint, r->>'ship_from', coalesce(r->>'stock','unknown'),
        r->>'product_url', r->>'click_url', coalesce(r->'destinations','{}'::jsonb), r->>'delivery_time', (r->>'source_updated_at')::timestamptz, v_run)
      returning id into v_offer_id;
      insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id)
      values (v_offer_id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run);
      n_off_new := n_off_new + 1;
    else
      if v_offer.price_minor <> (r->>'price_minor')::bigint or v_offer.currency <> r->>'currency'
         or (v_offer.destinations #>> array[coalesce(r->>'ship_from',''),'shipping','amountMinor']) is distinct from (r->>'home_shipping_minor') then
        insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id)
        values (v_offer.id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run);
      end if;
      update public.offers set
        variant_id = v_variant_id, feed_id = v_feed.id, title_at_source = r->>'title',
        price_minor = (r->>'price_minor')::bigint, currency = r->>'currency',
        vat_included = coalesce((r->>'vat_included')::boolean, v_feed.vat_included),
        rrp_minor = (r->>'rrp_minor')::bigint, ship_from = r->>'ship_from', stock = coalesce(r->>'stock','unknown'),
        product_url = r->>'product_url', click_url = r->>'click_url', destinations = coalesce(r->'destinations','{}'::jsonb),
        delivery_time = r->>'delivery_time', source_updated_at = (r->>'source_updated_at')::timestamptz,
        is_active = true, last_seen_at = now(), last_import_run_id = v_run, updated_at = now()
      where id = v_offer.id;
      n_off_upd := n_off_upd + 1;
    end if;
    n_imported := n_imported + 1;
  end loop;

  update public.import_runs set rows_imported = rows_imported + n_imported, variants_created = variants_created + n_var,
    offers_created = offers_created + n_off_new, offers_updated = offers_updated + n_off_upd
  where id = v_run;

  return jsonb_build_object('imported', n_imported, 'variants_created', n_var, 'offers_created', n_off_new, 'offers_updated', n_off_upd, 'retailer_id', v_retailer_id);
end $$;
-- ============================ END 20261027120000_category_reclassification.sql ==============================

-- ============================ BEGIN 20261027230000_sync_parent_categories.sql ============================
create or replace function public.pa_import_batch(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_run uuid := (p->>'run_id')::uuid;
  v_feed public.feeds;
  v_source text := p->>'source';
  v_ret jsonb := p->'retailer';
  v_retailer_id uuid;
  r jsonb;
  img jsonb;
  v_identity text;
  v_family text;
  v_product_id uuid;
  v_variant public.variants;
  v_variant_id uuid;
  v_offer public.offers;
  v_offer_id uuid;
  v_dept text; v_sub text;
  v_map public.category_mappings;
  v_slug text;
  v_cond text;
  v_new_variant boolean;
  n_imported int := 0; n_var int := 0; n_off_new int := 0; n_off_upd int := 0;
  pos int;
begin
  select * into v_feed from public.feeds where id = (p->>'feed_id')::uuid;
  if not found then raise exception 'feed not found'; end if;

  insert into public.retailers (source, external_id, name, country, website_domain)
  values (v_source, v_ret->>'external_id', v_ret->>'name', v_ret->>'country', v_ret->>'website_domain')
  on conflict (source, external_id) do update
    set name = excluded.name, country = coalesce(excluded.country, retailers.country),
        website_domain = coalesce(excluded.website_domain, retailers.website_domain), updated_at = now()
  returning id into v_retailer_id;

for r in select * from jsonb_array_elements(p->'rows') loop
  v_map := null;
  v_cond := coalesce(r->>'condition', 'new');

    -- 1. Department: a manual admin mapping wins over the importer's automatic guess.
    v_dept := r->>'department_slug'; v_sub := r->>'subcategory_slug';
    if r->>'category' is not null then
      select * into v_map from public.category_mappings where source = v_source and source_category = r->>'category';
      if found and v_map.manual then v_dept := v_map.department_slug; v_sub := v_map.subcategory_slug; end if;
      insert into public.category_mappings (source, source_category, department_slug, subcategory_slug, product_count)
      values (v_source, r->>'category', v_dept, v_sub, 1)
      on conflict (source, source_category) do update
        set product_count = category_mappings.product_count + 1,
            department_slug = case when category_mappings.manual then category_mappings.department_slug else excluded.department_slug end,
            subcategory_slug = case when category_mappings.manual then category_mappings.subcategory_slug else excluded.subcategory_slug end,
            updated_at = now();
    end if;

    -- 2. Identity: GTIN+condition, else brand+MPN+colour+size+condition, else this retailer's own listing.
    if r->>'gtin' is not null then
      v_identity := 'gtin:' || (r->>'gtin') || '|' || v_cond;
    elsif nullif(r->>'brand','') is not null and nullif(r->>'mpn','') is not null then
      v_identity := 'mpn:' || public.pa_norm(r->>'brand') || '|' || public.pa_norm(r->>'mpn') || '|' ||
                    public.pa_norm(coalesce(r->>'colour','')) || '|' || public.pa_norm(coalesce(r->>'size','')) || '|' || v_cond;
    else
      v_identity := 'src:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'external_id');
    end if;

    select * into v_variant from public.variants where identity_key = v_identity;
    -- Guard: same GTIN but contradicting colour/size => never merge. Keep separate + flag for review.
    if found and v_identity like 'gtin:%' and (public.pa_conflicts(v_variant.colour, r->>'colour') or public.pa_conflicts(v_variant.size, r->>'size')) then
      insert into public.match_reviews (variant_id, reason, detail)
      values (v_variant.id, 'gtin_attribute_conflict', jsonb_build_object(
        'gtin', r->>'gtin', 'existing', jsonb_build_object('colour', v_variant.colour, 'size', v_variant.size, 'title', v_variant.title),
        'incoming', jsonb_build_object('colour', r->>'colour', 'size', r->>'size', 'title', r->>'title', 'retailer', v_ret->>'name', 'external_id', r->>'external_id')));
      v_identity := 'src:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'external_id');
      select * into v_variant from public.variants where identity_key = v_identity;
    end if;

    v_new_variant := not found;
    if v_new_variant then
      -- Family: retailer-provided parent/group id groups colour/size siblings; otherwise one family per variant.
      v_family := case when nullif(r->>'parent_id','') is not null
                       then 'grp:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'parent_id')
                       else 'v:' || v_identity end;
      insert into public.products (family_key, brand, name, mpn, department_slug, subcategory_slug)
      values (v_family, r->>'brand', r->>'family_name', r->>'mpn', v_dept, v_sub)
      on conflict (family_key) do update set updated_at = now()
      returning id into v_product_id;

      v_slug := left(public.pa_slugify(concat_ws(' ', r->>'brand', r->>'title', nullif(r->>'variant_label',''))), 90);
      if v_slug = '' then v_slug := 'product'; end if;
      v_slug := v_slug || '-' || substr(md5(v_identity), 1, 8);

      insert into public.variants (product_id, identity_key, slug, title, brand, mpn, gtin, condition, colour, size, variant_label,
                                   description, specs, keywords, department_slug, subcategory_slug, source_category)
      values (v_product_id, v_identity, v_slug, r->>'title', r->>'brand', r->>'mpn', r->>'gtin', v_cond, r->>'colour', r->>'size',
              coalesce(r->>'variant_label',''), r->>'description', coalesce(r->'specs','{}'::jsonb), coalesce(r->>'keywords',''),
              v_dept, v_sub, r->>'category')
      returning id into v_variant_id;
      n_var := n_var + 1;
    else
      v_variant_id := v_variant.id;
      -- Fill gaps only; never overwrite identity fields from a different retailer.
      update public.variants set
        description = coalesce(variants.description, r->>'description'),
        colour = coalesce(variants.colour, r->>'colour'),
        size = coalesce(variants.size, r->>'size'),
        mpn = coalesce(variants.mpn, r->>'mpn'),
        department_slug = case
          when coalesce(v_map.manual, false) then v_dept
          else coalesce(v_dept, variants.department_slug)
        end,
        subcategory_slug = case
          when coalesce(v_map.manual, false) then v_sub
          when v_dept is not null then v_sub
          else variants.subcategory_slug
        end,
        keywords = case when length(variants.keywords) < 400 and position(coalesce(r->>'keywords','') in variants.keywords) = 0
                        then left(variants.keywords || ' ' || coalesce(r->>'keywords',''), 1000) else variants.keywords end,
        updated_at = now()
      where id = v_variant_id;
    end if;
        -- Keep the parent product category aligned with its variants.
    -- Do not replace an existing category with an unknown value.
    update public.products p
    set
      department_slug = coalesce(v_dept, p.department_slug),
      subcategory_slug = case
        when v_dept is not null then v_sub
        else p.subcategory_slug
      end,
      updated_at = now()
    where p.id = (
      select product_id
      from public.variants
      where id = v_variant_id
    )
    and v_dept is not null;
    perform public.pa_refresh_search_doc(v_variant_id);

    -- 3. Images (only https URLs reach this point).
    pos := 0;
    for img in select * from jsonb_array_elements(coalesce(r->'images','[]'::jsonb)) loop
      insert into public.variant_images (variant_id, url, position, source, feed_id, alt)
      values (v_variant_id, img #>> '{}', (select coalesce(max(position)+1, 0) from public.variant_images where variant_id = v_variant_id), v_source, v_feed.id, r->>'title')
      on conflict (variant_id, url) do update set last_seen_at = now();
      pos := pos + 1;
    end loop;

    -- 4. Offer upsert + price history when the price (or shipping) changes.
    select * into v_offer from public.offers where source = v_source and retailer_id = v_retailer_id and external_id = r->>'external_id';
    if not found then
      insert into public.offers (variant_id, retailer_id, feed_id, source, external_id, title_at_source, price_minor, currency, vat_included,
        rrp_minor, ship_from, stock, product_url, click_url, destinations, delivery_time, source_updated_at, last_import_run_id)
      values (v_variant_id, v_retailer_id, v_feed.id, v_source, r->>'external_id', r->>'title', (r->>'price_minor')::bigint, r->>'currency',
        coalesce((r->>'vat_included')::boolean, v_feed.vat_included), (r->>'rrp_minor')::bigint, r->>'ship_from', coalesce(r->>'stock','unknown'),
        r->>'product_url', r->>'click_url', coalesce(r->'destinations','{}'::jsonb), r->>'delivery_time', (r->>'source_updated_at')::timestamptz, v_run)
      returning id into v_offer_id;
      insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id)
      values (v_offer_id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run);
      n_off_new := n_off_new + 1;
    else
      if v_offer.price_minor <> (r->>'price_minor')::bigint or v_offer.currency <> r->>'currency'
         or (v_offer.destinations #>> array[coalesce(r->>'ship_from',''),'shipping','amountMinor']) is distinct from (r->>'home_shipping_minor') then
        insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id)
        values (v_offer.id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run);
      end if;
      update public.offers set
        variant_id = v_variant_id, feed_id = v_feed.id, title_at_source = r->>'title',
        price_minor = (r->>'price_minor')::bigint, currency = r->>'currency',
        vat_included = coalesce((r->>'vat_included')::boolean, v_feed.vat_included),
        rrp_minor = (r->>'rrp_minor')::bigint, ship_from = r->>'ship_from', stock = coalesce(r->>'stock','unknown'),
        product_url = r->>'product_url', click_url = r->>'click_url', destinations = coalesce(r->'destinations','{}'::jsonb),
        delivery_time = r->>'delivery_time', source_updated_at = (r->>'source_updated_at')::timestamptz,
        is_active = true, last_seen_at = now(), last_import_run_id = v_run, updated_at = now()
      where id = v_offer.id;
      n_off_upd := n_off_upd + 1;
    end if;
    n_imported := n_imported + 1;
  end loop;

  update public.import_runs set rows_imported = rows_imported + n_imported, variants_created = variants_created + n_var,
    offers_created = offers_created + n_off_new, offers_updated = offers_updated + n_off_upd
  where id = v_run;

  return jsonb_build_object('imported', n_imported, 'variants_created', n_var, 'offers_created', n_off_new, 'offers_updated', n_off_upd, 'retailer_id', v_retailer_id);
end $$;
-- ============================ END 20261027230000_sync_parent_categories.sql ==============================

-- ---- Verification: any problem raises an error and rolls back everything above ----
do $pv$
declare t text; f text; n int; problems text[] := '{}';
begin
  foreach t in array array['retailers', 'products', 'variants', 'variant_images', 'feeds', 'import_runs', 'import_errors', 'offers', 'price_observations', 'fx_rates', 'category_mappings', 'match_reviews', 'click_events', 'stores', 'promotions', 'promotion_stores', 'user_saved_products', 'price_alerts', 'price_alert_events'] loop
    if to_regclass('public.' || t) is null then problems := problems || ('missing table ' || t); continue; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then problems := problems || ('row-level security is off on ' || t); end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      problems := problems || ('the public key can access table ' || t);
    end if;
  end loop;
  foreach t in array array['retailers', 'products', 'variants', 'variant_images', 'feeds', 'import_runs', 'import_errors', 'offers', 'price_observations', 'fx_rates', 'category_mappings', 'match_reviews', 'click_events', 'stores', 'promotions', 'promotion_stores', 'price_alert_events'] loop
    if to_regclass('public.' || t) is not null and has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      problems := problems || ('signed-in users can access table ' || t || ' directly');
    end if;
  end loop;
  foreach t in array array['user_saved_products', 'price_alerts'] loop
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
  select count(distinct proname) into n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'pa\_%';
  if n <> 36 then problems := problems || format('expected 36 pa_* functions, found %s', n); end if;
  foreach f in array array['pa_catalog_product', 'pa_catalog_by_ids', 'pa_catalog_list', 'pa_catalog_search', 'pa_catalog_suggest', 'pa_catalog_meta', 'pa_catalog_price_drops', 'pa_catalog_local_offers', 'pa_catalog_price_history'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f and has_function_privilege('anon', p.oid, 'EXECUTE')) then
      problems := problems || ('public key cannot call ' || f);
    end if;
  end loop;
  foreach f in array array['pa_import_start', 'pa_import_batch', 'pa_import_log_errors', 'pa_import_finish', 'pa_fx_upsert', 'pa_offer_redirect', 'pa_admin_overview', 'pa_admin_feed_get', 'pa_admin_feeds_due', 'pa_admin_feeds_upsert', 'pa_admin_feed_update', 'pa_admin_run', 'pa_admin_issues', 'pa_admin_review_set', 'pa_admin_category_set', 'pa_alerts_due', 'pa_alert_observe', 'pa_alert_event_update', 'pa_alert_unsubscribe', 'pa_norm', 'pa_slugify', 'pa_refresh_search_doc', 'pa_conflicts', 'pa_variant_json', 'pa_alerts_guard'] loop
    if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
               and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))) then
      problems := problems || ('public key can call ' || f);
    end if;
  end loop;
  foreach f in array array['pa_me_data', 'pa_me_sync'] loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
                   and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
                   and not p.prosecdef) then
      problems := problems || ('account function ' || f || ' has the wrong permissions');
    end if;
  end loop;
  foreach f in array array['pa_import_start', 'pa_import_batch', 'pa_import_log_errors', 'pa_import_finish', 'pa_fx_upsert', 'pa_offer_redirect', 'pa_admin_overview', 'pa_admin_feed_get', 'pa_admin_feeds_due', 'pa_admin_feeds_upsert', 'pa_admin_feed_update', 'pa_admin_run', 'pa_admin_issues', 'pa_admin_review_set', 'pa_admin_category_set', 'pa_alerts_due', 'pa_alert_observe', 'pa_alert_event_update', 'pa_alert_unsubscribe'] loop
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
select 'tables' as item, count(*)::text as value from pg_tables where schemaname = 'public' and tablename = any(array['retailers', 'products', 'variants', 'variant_images', 'feeds', 'import_runs', 'import_errors', 'offers', 'price_observations', 'fx_rates', 'category_mappings', 'match_reviews', 'click_events', 'stores', 'promotions', 'promotion_stores', 'user_saved_products', 'price_alerts', 'price_alert_events'])
union all select 'account tables protected by row-level security', count(*)::text from pg_tables where schemaname = 'public' and rowsecurity and tablename = any(array['user_saved_products', 'price_alerts', 'price_alert_events'])
union all select 'pa_* functions', count(distinct proname)::text from pg_proc where pronamespace = 'public'::regnamespace and proname like 'pa\_%'
union all select 'functions callable with the public key', count(distinct proname)::text from pg_proc where pronamespace = 'public'::regnamespace and proname like 'pa\_%' and has_function_privilege('anon', oid, 'EXECUTE')
union all select 'extensions', string_agg(e.extname || ' in ' || n.nspname, ', ' order by e.extname) from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname in ('pg_trgm', 'unaccent', 'pgcrypto')
union all select 'result', 'PriceViva database is ready (everything above was verified before COMMIT)';
