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
