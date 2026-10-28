-- DRAFT: Phase 2. Apply only after separate database approval.
-- Additive schema changes only: no catalog rewrite, deletion, or identity-key backfill.
-- Older importer clients may omit pack fields; unknown quantities stay unknown.
alter table public.variants add column if not exists pack_quantity integer
  check (pack_quantity is null or pack_quantity between 1 and 100000);
alter table public.variants add column if not exists manual_category_mapping_id uuid
  references public.category_mappings(id);
alter table public.offers add column if not exists source_category text;
-- New observations retain their product context even if a retailer reuses a listing ID.
-- Old observations are tagged only when that offer moves, never bulk-rewritten.
alter table public.price_observations add column if not exists variant_id uuid references public.variants(id);
create index if not exists price_observations_variant_idx on public.price_observations (variant_id, observed_at);

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
  v_source_identity text;
  v_legacy_identity text;
  v_pack integer;
  v_pack_uncertain boolean;
  v_manual public.category_mappings;
  v_has_variant boolean;
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
  v_manual := null;
  v_cond := coalesce(r->>'condition', 'new');
  v_pack := nullif(r->>'pack_quantity', '')::integer;
  v_pack_uncertain := coalesce((r->>'pack_quantity_uncertain')::boolean, false);
  if v_pack is not null and (v_pack < 1 or v_pack > 100000) then
    raise exception 'invalid pack quantity';
  end if;
  -- Serialize this retailer/listing across feeds, then the cross-retailer identity.
  perform pg_advisory_xact_lock(hashtextextended('offer:' || v_source || ':' || v_retailer_id::text || ':' || (r->>'external_id'), 0));

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

    -- 2. Known pack quantities participate in MPN identities; unknown is not one.
    -- Preserve legacy unknown-pack MPN keys for backward compatibility.
    v_legacy_identity := 'src:' || v_source || ':' || (v_ret->>'external_id') || ':' || (r->>'external_id');
    v_source_identity := v_legacy_identity || '|condition:' || v_cond || '|pack:' || coalesce(v_pack::text, '?') ||
      '|colour:' || public.pa_norm(coalesce(r->>'colour','')) || '|size:' || public.pa_norm(coalesce(r->>'size',''));
    if v_pack_uncertain then
      -- Do not merge uncertain packs with any previous confident/unknown-pack listing.
      v_source_identity := v_source_identity || '|uncertain';
      v_identity := v_source_identity;
    elsif r->>'gtin' is not null then
      v_identity := 'gtin:' || (r->>'gtin') || '|' || v_cond;
    elsif nullif(r->>'brand','') is not null and nullif(r->>'mpn','') is not null then
      v_identity := 'mpn:' || public.pa_norm(r->>'brand') || '|' || public.pa_norm(r->>'mpn') || '|' ||
                    public.pa_norm(coalesce(r->>'colour','')) || '|' || public.pa_norm(coalesce(r->>'size','')) || '|' || v_cond;
      if v_pack is not null then v_identity := v_identity || '|pack:' || v_pack::text; end if;
    else
      v_identity := v_source_identity;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_identity, 0));
    select * into v_variant from public.variants where identity_key = v_identity for update;
    v_has_variant := found;
    -- Same GTIN with contradictory known attributes/pack is a review, never a merge.
    if v_has_variant and v_identity like 'gtin:%' and
       (public.pa_conflicts(v_variant.colour, r->>'colour') or public.pa_conflicts(v_variant.size, r->>'size')
        or (v_variant.pack_quantity is not null and v_pack is not null and v_variant.pack_quantity <> v_pack)) then
      insert into public.match_reviews (variant_id, reason, detail)
      select v_variant.id, 'gtin_attribute_conflict', jsonb_build_object(
        'gtin', r->>'gtin', 'existing', jsonb_build_object('colour', v_variant.colour, 'size', v_variant.size, 'pack_quantity', v_variant.pack_quantity, 'title', v_variant.title),
        'incoming', jsonb_build_object('colour', r->>'colour', 'size', r->>'size', 'pack_quantity', v_pack, 'title', r->>'title', 'retailer', v_ret->>'name', 'external_id', r->>'external_id'))
      where not exists (select 1 from public.match_reviews mr
        where mr.variant_id = v_variant.id and mr.reason = 'gtin_attribute_conflict' and mr.status = 'open'
          and mr.detail->'incoming'->>'retailer' = v_ret->>'name'
          and mr.detail->'incoming'->>'external_id' = r->>'external_id'
          and mr.detail->'incoming'->>'colour' is not distinct from r->>'colour'
          and mr.detail->'incoming'->>'size' is not distinct from r->>'size'
          and mr.detail->'incoming'->>'pack_quantity' is not distinct from v_pack::text);
      v_identity := v_source_identity;
      perform pg_advisory_xact_lock(hashtextextended(v_identity, 0));
      select * into v_variant from public.variants where identity_key = v_identity for update;
      v_has_variant := found;
    end if;

    -- An old source key can be reused only for this listing, same condition and same pack state.
    -- Do not rewrite existing identity keys or infer a pack quantity for old variants.
    if not v_has_variant and v_identity = v_source_identity and not v_pack_uncertain then
      select * into v_variant from public.variants
      where identity_key = v_legacy_identity and condition = v_cond
        and pack_quantity is not distinct from v_pack
        and not public.pa_conflicts(colour, r->>'colour') and not public.pa_conflicts(size, r->>'size')
      for update;
      v_has_variant := found;
    end if;
    v_new_variant := not v_has_variant;
    if v_new_variant then
      if coalesce(v_map.manual, false) then v_manual := v_map; end if;
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
                                   description, specs, keywords, department_slug, subcategory_slug, source_category, pack_quantity, manual_category_mapping_id)
      values (v_product_id, v_identity, v_slug, r->>'title', r->>'brand', r->>'mpn', r->>'gtin', v_cond, r->>'colour', r->>'size',
              coalesce(r->>'variant_label',''), r->>'description', coalesce(r->'specs','{}'::jsonb), coalesce(r->>'keywords',''),
              v_dept, v_sub, r->>'category', v_pack, case when v_map.manual then v_map.id end)
      returning id into v_variant_id;
      n_var := n_var + 1;
    else
      v_variant_id := v_variant.id;
      -- Recover existing manual authority before considering another retailer's guess.
      -- Legacy variants have no pointer: consult their original category and offer provider.
      v_manual := null;
      select m.* into v_manual from public.category_mappings m
      where m.manual and (m.id = v_variant.manual_category_mapping_id
        or (v_variant.manual_category_mapping_id is null and m.source_category = v_variant.source_category
          and exists (select 1 from public.offers o where o.variant_id = v_variant.id and o.source = m.source)))
      order by (m.id = v_variant.manual_category_mapping_id) desc nulls last, m.id limit 1;
      if found then
        v_dept := v_manual.department_slug; v_sub := v_manual.subcategory_slug;
      elsif coalesce(v_map.manual, false) then
        v_manual := v_map;
      end if;
      -- Fill identity gaps; keep an established manual category across retailer imports.
      update public.variants set
        description = coalesce(variants.description, r->>'description'),
        colour = coalesce(variants.colour, r->>'colour'),
        size = coalesce(variants.size, r->>'size'),
        mpn = coalesce(variants.mpn, r->>'mpn'),
        pack_quantity = coalesce(variants.pack_quantity, v_pack),
        variant_label = concat_ws(' · ', coalesce(variants.colour, r->>'colour'), coalesce(variants.size, r->>'size'),
          case when coalesce(variants.pack_quantity, v_pack) > 1 then coalesce(variants.pack_quantity, v_pack)::text || '-pack' end,
          case when variants.condition <> 'new' then replace(variants.condition, '_', ' ') end),
        manual_category_mapping_id = coalesce(v_manual.id, variants.manual_category_mapping_id),
        department_slug = case
          when v_manual.id is not null then v_dept
          else coalesce(v_dept, variants.department_slug)
        end,
        subcategory_slug = case
          when v_manual.id is not null then v_sub
          when v_dept is not null then v_sub
          else variants.subcategory_slug
        end,
        keywords = case when length(variants.keywords) < 400 and position(coalesce(r->>'keywords','') in variants.keywords) = 0
                        then left(variants.keywords || ' ' || coalesce(r->>'keywords',''), 1000) else variants.keywords end,
        updated_at = now()
      where id = v_variant_id;
    end if;
        -- Keep the parent product category aligned with its variants.
    -- Unknown automatic guesses do not clear categories; an explicit manual null does.
    update public.products p
    set
      department_slug = case when v_manual.id is not null then v_dept else coalesce(v_dept, p.department_slug) end,
      subcategory_slug = case
        when v_manual.id is not null then v_sub
        when v_dept is not null then v_sub
        else p.subcategory_slug
      end,
      updated_at = now()
    where p.id = (
      select product_id
      from public.variants
      where id = v_variant_id
    )
    and (v_dept is not null or v_manual.id is not null)
    and not exists (
      select 1 from public.variants sibling
      where sibling.product_id = p.id and sibling.id <> v_variant_id
        and sibling.manual_category_mapping_id is not null
        and (sibling.department_slug is distinct from v_dept or sibling.subcategory_slug is distinct from v_sub)
    );
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
        rrp_minor, ship_from, stock, product_url, click_url, destinations, delivery_time, source_updated_at, last_import_run_id, source_category)
      values (v_variant_id, v_retailer_id, v_feed.id, v_source, r->>'external_id', r->>'title', (r->>'price_minor')::bigint, r->>'currency',
        coalesce((r->>'vat_included')::boolean, v_feed.vat_included), (r->>'rrp_minor')::bigint, r->>'ship_from', coalesce(r->>'stock','unknown'),
        r->>'product_url', r->>'click_url', coalesce(r->'destinations','{}'::jsonb), r->>'delivery_time', (r->>'source_updated_at')::timestamptz, v_run, r->>'category')
      returning id into v_offer_id;
      insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id, variant_id)
      values (v_offer_id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run, v_variant_id);
      n_off_new := n_off_new + 1;
    else
      if v_offer.variant_id <> v_variant_id then
        update public.price_observations set variant_id = v_offer.variant_id
        where offer_id = v_offer.id and variant_id is null;
      end if;
      if v_offer.variant_id <> v_variant_id or v_offer.price_minor <> (r->>'price_minor')::bigint or v_offer.currency <> r->>'currency'
         or (v_offer.destinations #>> array[coalesce(r->>'ship_from',''),'shipping','amountMinor']) is distinct from (r->>'home_shipping_minor') then
        insert into public.price_observations (offer_id, price_minor, currency, shipping_minor, import_run_id, variant_id)
        values (v_offer.id, (r->>'price_minor')::bigint, r->>'currency', (r->>'home_shipping_minor')::bigint, v_run, v_variant_id);
      end if;
      update public.offers set
        variant_id = v_variant_id, feed_id = v_feed.id, title_at_source = r->>'title', source_category = r->>'category',
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

revoke all on function public.pa_import_batch(jsonb) from public, anon, authenticated;
grant execute on function public.pa_import_batch(jsonb) to service_role;

-- Explicit admin actions retain their mapping identity on every affected variant.
-- Scope by provider and the offer's category; old offers fall back to the variant's original category.
create or replace function public.pa_admin_category_set(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare m public.category_mappings;
begin
  update public.category_mappings set department_slug = nullif(p->>'department_slug',''),
         subcategory_slug = nullif(p->>'subcategory_slug',''), manual = true, updated_at = now()
  where id = (p->>'id')::uuid returning * into m;
  if not found then return jsonb_build_object('ok', false); end if;

  with affected as (
    update public.variants v set department_slug = m.department_slug, subcategory_slug = m.subcategory_slug,
      manual_category_mapping_id = m.id, updated_at = now()
    where v.manual_category_mapping_id = m.id or exists (
      select 1 from public.offers o where o.variant_id = v.id and o.source = m.source
        and (o.source_category = m.source_category
             or (o.source_category is null and v.source_category = m.source_category))
    ) returning v.product_id
  )
  -- A manual category never spreads to conflicting siblings. Reconcile only unanimous families.
  -- A data-modifying CTE shares the statement snapshot, so use the intended values for affected children.
  update public.products parent set department_slug = m.department_slug, subcategory_slug = m.subcategory_slug, updated_at = now()
  where parent.id in (select product_id from affected)
    and not exists (
      select 1 from public.variants sibling where sibling.product_id = parent.id
        and sibling.manual_category_mapping_id is distinct from m.id
        and not exists (select 1 from public.offers o where o.variant_id = sibling.id and o.source = m.source
          and (o.source_category = m.source_category or (o.source_category is null and sibling.source_category = m.source_category)))
        and (sibling.department_slug is distinct from m.department_slug or sibling.subcategory_slug is distinct from m.subcategory_slug)
    );
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pa_admin_category_set(jsonb) from public, anon, authenticated;
grant execute on function public.pa_admin_category_set(jsonb) to service_role;

-- Price-reference and history reads respect the observation's preserved variant context.
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
        where po.offer_id = o.id and (po.variant_id is null or po.variant_id = v.id) and po.observed_at >= now() - interval '31 days' and po.observed_at < date_trunc('day', now()) and po.currency = o.currency
      ) ref on true
      where o.variant_id = v.id and o.is_active), '[]'::jsonb)
  )
$$;

create or replace function public.pa_catalog_price_history(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'offerId', o.id, 'retailer', r.name, 'retailerCountry', r.country,
      'observedAt', po.observed_at, 'priceMinor', po.price_minor, 'currency', po.currency, 'shippingMinor', po.shipping_minor,
      'source', 'awin'
    ) order by po.observed_at), '[]'::jsonb)
  from public.price_observations po
  join public.offers o on o.id = po.offer_id
  join public.variants v on v.id = coalesce(po.variant_id, o.variant_id)
  join public.retailers r on r.id = o.retailer_id
  where (v.slug = p->>'slug' or v.id::text = p->>'id')
    and po.observed_at > now() - interval '730 days'
    and po.id in (select id from public.price_observations x where x.offer_id = o.id and coalesce(x.variant_id, o.variant_id) = v.id order by x.observed_at desc limit 2000)
$$;

revoke all on function public.pa_variant_json(public.variants) from public, anon, authenticated;
revoke all on function public.pa_catalog_price_history(jsonb) from public;
grant execute on function public.pa_catalog_price_history(jsonb) to anon, authenticated, service_role;
