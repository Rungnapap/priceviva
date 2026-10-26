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
