-- =============================================================================
-- PriceViva v0.7: lock down the internal helper functions.
-- Supabase gives anon/authenticated EXECUTE on new functions by default. These helpers are only needed inside the
-- database (search index and the security-definer pa_* functions, which run as their owner), so the public API
-- should not expose them. Additive and safe to run more than once; changes no data.
-- =============================================================================
revoke all on function public.pa_norm(text) from public, anon, authenticated;
revoke all on function public.pa_slugify(text) from public, anon, authenticated;
revoke all on function public.pa_conflicts(text, text) from public, anon, authenticated;
