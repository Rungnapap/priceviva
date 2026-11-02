-- =============================================================================
-- Sitemap (v0.7.5): product addresses for /sitemap.xml — only products with at least one active offer.
-- Read in pages (keyset on the unique slug index) so each call stays small and fast.
-- Safe to run more than once.
-- =============================================================================

create or replace function public.pa_catalog_sitemap(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(x.slug order by x.slug), '[]'::jsonb)
  from (select v.slug from public.variants v
        where v.slug > coalesce(p->>'after', '')
          and exists (select 1 from public.offers o where o.variant_id = v.id and o.is_active)
        order by v.slug
        limit least(greatest(coalesce((p->>'limit')::int, 5000), 1), 10000)) x
$$;

revoke all on function public.pa_catalog_sitemap(jsonb) from public;
grant execute on function public.pa_catalog_sitemap(jsonb) to anon, authenticated, service_role;
