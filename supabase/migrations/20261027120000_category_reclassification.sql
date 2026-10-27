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
