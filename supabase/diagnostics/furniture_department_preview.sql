-- PREVIEW ONLY. Prepared locally; not executed against production.
-- Uses pre-Phase-2 columns so the owner can review it before approving any database work.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT v.department_slug, v.subcategory_slug, count(*) AS live_variants
FROM public.variants v
WHERE EXISTS (SELECT 1 FROM public.offers o WHERE o.variant_id=v.id AND o.is_active)
GROUP BY v.department_slug,v.subcategory_slug ORDER BY live_variants DESC;
SELECT v.id,v.slug,v.title,v.department_slug,v.subcategory_slug,
       (SELECT count(*) FROM public.offers o WHERE o.variant_id=v.id AND o.is_active) AS live_offers
FROM public.variants v
WHERE (v.department_slug='home' AND v.subcategory_slug='furniture') OR v.department_slug='furniture'
ORDER BY v.id LIMIT 200;
SELECT source,source_category,department_slug,subcategory_slug,manual
FROM public.category_mappings
WHERE (department_slug='home' AND subcategory_slug='furniture') OR department_slug='furniture'
ORDER BY manual DESC,source,source_category;
-- Do not infer live furniture stock solely from title words; these are review candidates.
SELECT v.id,v.slug,v.title,v.department_slug,v.subcategory_slug
FROM public.variants v
WHERE v.title ~* '\m(sofa|armchair|wardrobe|mattress|bookcase|desk)\M'
  AND EXISTS (SELECT 1 FROM public.offers o WHERE o.variant_id=v.id AND o.is_active)
ORDER BY v.id LIMIT 100;
ROLLBACK;
