-- =============================================================================
-- Faster catalogue reads (v0.7.5). Same results and rules as 20261028140000_furniture_department.sql (including
-- the effective category from pa_catalog_category, so retired home/furniture rows show as Furniture), less work:
--   * variants.name_norm: the normalised "title brand" text, stored once instead of recomputed (unaccent) for every
--     row on every search, with a trigram index so typo-tolerant search and suggestions use an index, not a full scan.
--   * search ranks matches cheaply first and builds the full product JSON only for the returned page (default 96, was 240);
--     typo-tolerant matching runs only when exact words do not fill a page.
--   * lists count active offers once per request (one grouped scan) instead of once per product.
--   * meta finds the products with active offers once instead of three times.
-- Safe to run more than once.
-- =============================================================================

alter table public.variants
  add column if not exists name_norm text generated always as (public.pa_norm(title || ' ' || coalesce(brand, ''))) stored;
create index if not exists variants_name_norm_trgm on public.variants using gin (name_norm extensions.gin_trgm_ops);
-- variants_title_trgm (title only) is no longer used by any query. It is kept because migrations never drop
-- anything (tests/apply-bundle.test.ts); it can be removed by hand in the SQL editor to make imports a little faster.
analyze public.variants;

-- Department / subcategory listing, or a shelf (limit). Products with photos and more offers first.
create or replace function public.pa_catalog_list(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  with request as (select public.pa_catalog_category(p->>'department', p->>'subcategory') as cat),
  oc as (
    select o.variant_id, count(*) as n_offers from public.offers o where o.is_active group by o.variant_id
  ), live as (
    select v.id, v.updated_at, oc.n_offers,
           exists (select 1 from public.variant_images i where i.variant_id = v.id) as has_img
    from public.variants v join oc on oc.variant_id = v.id cross join request
    where (request.cat->>'department' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' = request.cat->>'department')
      and (request.cat->>'subcategory' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory' = request.cat->>'subcategory')
      and (p->>'condition' is null or v.condition = p->>'condition')
  ), page as (
    select * from live order by has_img desc, n_offers desc, updated_at desc
    limit least(coalesce((p->>'limit')::int, 24), 100) offset greatest(coalesce((p->>'offset')::int, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from live),
    'items', coalesce((select jsonb_agg(public.pa_variant_json(v) order by pg.has_img desc, pg.n_offers desc, pg.updated_at desc)
                       from page pg join public.variants v on v.id = pg.id), '[]'::jsonb))
$$;

-- Full-text + trigram (typo-tolerant) search, exact GTIN, filters. Returns up to p.limit hits (default 96, max 240).
create or replace function public.pa_catalog_search(p jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare q text := left(coalesce(p->>'q',''), 120); nq text; tsq tsquery; digits text; typo boolean;
        category jsonb := public.pa_catalog_category(p->>'department', p->>'subcategory');
        lim int := least(greatest(coalesce((p->>'limit')::int, 96), 1), 240);
begin
  nq := public.pa_norm(q);
  digits := regexp_replace(q, '\s', '', 'g');
  if digits ~ '^[0-9]{8,14}$' then
    return coalesce((select jsonb_agg(public.pa_variant_json(v)) from public.variants v
      where v.gtin = lpad(digits, 14, '0')
        and (category->>'department' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' = category->>'department')
        and (category->>'subcategory' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory' = category->>'subcategory')
        and (p->>'condition' is null or v.condition = p->>'condition') and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)), '[]'::jsonb);
  end if;
  if nq = '' then
    return (public.pa_catalog_list(jsonb_build_object('department', category->>'department', 'subcategory', category->>'subcategory',
                                                      'condition', p->>'condition', 'limit', least(lim, 100))))->'items';
  end if;
  tsq := (select to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & ')) from regexp_split_to_table(nq, '[^a-z0-9]+') w where w <> '');
  -- Typo-tolerant (trigram) matching has to compare the query with every product name, so it runs only when exact
  -- words do not already fill a page of results: "strumpr" still finds "strumpor", while "strumpor" (thousands of
  -- exact matches) skips it.
  typo := tsq is null or (select count(*) from (
            select 1 from public.variants v where v.search_doc @@ tsq
              and (category->>'department' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' = category->>'department')
              and (category->>'subcategory' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory' = category->>'subcategory')
              and (p->>'condition' is null or v.condition = p->>'condition')
            limit lim) x) < lim;
  return coalesce((
    with cand as (
      select v.id from public.variants v where tsq is not null and v.search_doc @@ tsq
      union
      select v.id from public.variants v where typo and nq <% v.name_norm   -- word_similarity >= 0.45
    ), scored as (
      select v.id, coalesce(ts_rank(v.search_doc, tsq), 0) * 2 + extensions.word_similarity(nq, v.name_norm) as score
      from cand c join public.variants v on v.id = c.id
      where (category->>'department' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' = category->>'department')
        and (category->>'subcategory' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory' = category->>'subcategory')
        and (p->>'condition' is null or v.condition = p->>'condition')
        and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
      order by score desc, v.id
      limit lim
    )
    select jsonb_agg(public.pa_variant_json(v) order by s.score desc, s.id) from scored s join public.variants v on v.id = s.id), '[]'::jsonb);
end $$;

-- Lightweight autocomplete (no offers payload). Six suggestions are ranked from at most 300 names that contain the
-- text plus 300 close (typo) matches, instead of scoring every matching product.
create or replace function public.pa_catalog_suggest(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
set pg_trgm.word_similarity_threshold = 0.5
as $$
  with q as (select public.pa_norm(left(coalesce(p->>'q',''), 80)) as nq),
  cand as (
    (select v.id from public.variants v, q
     where length(q.nq) >= 2 and v.name_norm like '%' || q.nq || '%'
       and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
     limit 300)
    union
    (select v.id from public.variants v, q
     where length(q.nq) >= 2 and q.nq <% v.name_norm
       and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
     limit 300)
  )
  select coalesce(jsonb_agg(jsonb_build_object('slug', s.slug, 'label', concat_ws(' ', s.brand, s.title), 'hint', s.variant_label)), '[]'::jsonb)
  from (select v.slug, v.brand, v.title, v.variant_label
        from cand c join public.variants v on v.id = c.id, q
        order by extensions.word_similarity(q.nq, v.name_norm) desc, v.slug
        limit 6) s
$$;

-- Counts per department + overall stats + latest FX rates (effective categories, as in the Furniture migration).
create or replace function public.pa_catalog_meta(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  with av as materialized (
    select public.pa_catalog_category(v.department_slug, v.subcategory_slug) as cat from public.variants v
    where exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
  )
  select jsonb_build_object(
    'departments', coalesce((select jsonb_object_agg(d, n) from (
        select cat->>'department' d, count(*) n from av where cat->>'department' is not null group by 1) x), '{}'::jsonb),
    'subcategories', coalesce((select jsonb_object_agg(d, n) from (
        select (cat->>'department') || '/' || (cat->>'subcategory') d, count(*) n from av where cat->>'subcategory' is not null group by 1) x), '{}'::jsonb),
    'products', (select count(*) from av),
    'offers', (select count(*) from public.offers where is_active),
    'retailers', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'country', r.country) order by r.name)
                  from public.retailers r where exists (select 1 from public.offers o where o.retailer_id = r.id and o.is_active)), '[]'::jsonb),
    'fx', (select jsonb_build_object('base', 'EUR', 'asOf', max(as_of), 'source', max(source),
                   'rates', jsonb_object_agg(quote, rate) || jsonb_build_object('EUR', 1))
           from public.fx_rates where base = 'EUR' and as_of = (select max(as_of) from public.fx_rates where base = 'EUR')),
    'stores', (select count(*) from public.stores)
  )
$$;
