-- DRAFT: read compatibility only. No product, offer, price or manual mapping rows are rewritten.
-- home/furniture is a retired public category alias, not a reason to mutate stored manual decisions.
create or replace function public.pa_catalog_category(dept text, sub text) returns jsonb
language sql immutable parallel safe
set search_path = public, extensions
as $$
  select case when dept = 'home' and sub = 'furniture'
    then jsonb_build_object('department', 'furniture', 'subcategory', null)
    else jsonb_build_object('department', nullif(dept,''), 'subcategory', nullif(sub,'')) end
$$;
revoke all on function public.pa_catalog_category(text,text) from public, anon, authenticated;

-- Public catalog functions execute as their existing owner and use this effective category.
create index if not exists variants_catalog_category_idx on public.variants
  ((public.pa_catalog_category(department_slug, subcategory_slug)->>'department'),
   (public.pa_catalog_category(department_slug, subcategory_slug)->>'subcategory'));

create or replace function public.pa_variant_json(v public.variants) returns jsonb
language sql stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', v.id, 'slug', v.slug, 'name', v.title, 'brand', coalesce(v.brand,''), 'productId', v.product_id,
    'department', coalesce(public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department',''), 'subcategory', coalesce(public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory',''),
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
        where po.offer_id = o.id and (po.variant_id is null or po.variant_id = v.id) and po.observed_at >= now() - interval '31 days' and po.observed_at < date_trunc('day', now()) and po.currency = o.currency
      ) ref on true
      where o.variant_id = v.id and o.is_active), '[]'::jsonb)
  )
$$;

create or replace function public.pa_catalog_list(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  with request as (select public.pa_catalog_category(p->>'department', p->>'subcategory') as cat), base as (
    select v as vrow, v.updated_at,
           (select count(*) from public.offers o where o.variant_id = v.id and o.is_active) as n_offers,
           exists (select 1 from public.variant_images i where i.variant_id = v.id) as has_img
    from public.variants v cross join request
    where (request.cat->>'department' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' = request.cat->>'department')
      and (request.cat->>'subcategory' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory' = request.cat->>'subcategory')
      and (p->>'condition' is null or v.condition = p->>'condition')
  ), live as (select * from base where n_offers > 0)
  select jsonb_build_object(
    'total', (select count(*) from live),
    'items', coalesce((select jsonb_agg(public.pa_variant_json(l.vrow) order by l.has_img desc, l.n_offers desc, l.updated_at desc) from (
        select * from live order by has_img desc, n_offers desc, updated_at desc
        limit least(coalesce((p->>'limit')::int, 24), 100) offset greatest(coalesce((p->>'offset')::int, 0), 0)) l), '[]'::jsonb))
$$;

create or replace function public.pa_catalog_search(p jsonb) returns jsonb
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare q text := left(coalesce(p->>'q',''), 120); nq text; tsq tsquery; digits text; category jsonb := public.pa_catalog_category(p->>'department', p->>'subcategory');
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
    return (public.pa_catalog_list(jsonb_build_object('department', category->>'department', 'subcategory', category->>'subcategory', 'condition', p->>'condition', 'limit', 240)))->'items';
  end if;
  tsq := (select to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & ')) from regexp_split_to_table(nq, '[^a-z0-9]+') w where w <> '');
  return coalesce((
    select jsonb_agg(public.pa_variant_json(x.v) order by x.score desc) from (
      select v, ts_rank(v.search_doc, tsq) * 2 + extensions.word_similarity(nq, public.pa_norm(v.title || ' ' || coalesce(v.brand,''))) as score
      from public.variants v
      where (v.search_doc @@ tsq or extensions.word_similarity(nq, public.pa_norm(v.title || ' ' || coalesce(v.brand,''))) >= 0.45)
        and (category->>'department' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' = category->>'department')
        and (p->>'condition' is null or v.condition = p->>'condition')
        and (category->>'subcategory' is null or public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory' = category->>'subcategory')
        and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
      order by score desc limit 240) x), '[]'::jsonb);
end $$;

create or replace function public.pa_catalog_meta(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'departments', coalesce((select jsonb_object_agg(d, n) from (
        select public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' d, count(*) n from public.variants v
        where public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department' is not null and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
        group by 1) x), '{}'::jsonb),
    'subcategories', coalesce((select jsonb_object_agg(d, n) from (
        select (public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'department') || '/' || (public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory') d, count(*) n from public.variants v
        where public.pa_catalog_category(v.department_slug, v.subcategory_slug)->>'subcategory' is not null and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
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

-- Existing read functions retain their public grants; explicitly restate the boundaries.
revoke all on function public.pa_variant_json(public.variants) from public, anon, authenticated;
revoke all on function public.pa_catalog_list(jsonb), public.pa_catalog_search(jsonb), public.pa_catalog_meta(jsonb) from public;
grant execute on function public.pa_catalog_list(jsonb), public.pa_catalog_search(jsonb), public.pa_catalog_meta(jsonb) to anon, authenticated, service_role;
