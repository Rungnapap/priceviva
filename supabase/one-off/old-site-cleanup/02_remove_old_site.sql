-- =============================================================================
-- Old website cleanup — STEP 2: REMOVE the old website's database objects  *** PERMANENT ***
-- Run ONLY after STEP 1 showed no BLOCKER / CHECK rows, and only after you have approved it.
--
-- Removes exactly:
--   tables     public.admin_users, public.company_settings, public.request_rate_limits, public.service_requests
--              (with their own triggers, RLS policies, grants, indexes, constraints and owned sequences)
--   functions  public.is_admin(), public.set_updated_at()
-- Does NOT touch: auth users (delete those in the dashboard), any other schema, extensions, roles, Supabase settings.
--
-- Safety:
--   * No CASCADE anywhere. If anything else depends on these objects, PostgreSQL refuses and nothing is removed.
--   * Runs in one transaction. Any error (or a failed check) rolls back everything.
--   * Stops if the four tables hold more rows than the inventory showed (+ a small margin), i.e. if this is not the
--     project you inspected, or the old website is still writing to it.
-- =============================================================================
begin;

do $pv$
declare t text; n bigint; missing text[] := '{}';
begin
  foreach t in array array['admin_users', 'company_settings', 'request_rate_limits', 'service_requests'] loop
    if to_regclass('public.' || t) is null then missing := missing || t; end if;
  end loop;
  if to_regprocedure('public.is_admin()') is null then missing := missing || 'is_admin()'::text; end if;
  if to_regprocedure('public.set_updated_at()') is null then missing := missing || 'set_updated_at()'::text; end if;
  if cardinality(missing) > 0 then
    raise exception 'Stopped, nothing changed: expected old object(s) not found: %. Is this the right project?', array_to_string(missing, ', ');
  end if;
  -- Inventory (25 Oct 2026): admin_users 1, company_settings 1, request_rate_limits 3, service_requests 1 rows.
  execute 'select (select count(*) from public.admin_users) + (select count(*) from public.company_settings)
                + (select count(*) from public.request_rate_limits) + (select count(*) from public.service_requests)' into n;
  if n > 50 then
    raise exception 'Stopped, nothing changed: the old tables hold % rows, far more than the 6 in the inventory. Check the project and that the old website is offline.', n;
  end if;
end $pv$;

-- One statement for all four tables, so foreign keys between them are not a problem. No CASCADE.
drop table public.admin_users, public.company_settings, public.request_rate_limits, public.service_requests;

-- The functions after the tables (their triggers and policies are gone by now). No CASCADE.
drop function public.is_admin();
drop function public.set_updated_at();

do $pv$
begin
  if to_regclass('public.admin_users') is not null or to_regclass('public.company_settings') is not null
     or to_regclass('public.request_rate_limits') is not null or to_regclass('public.service_requests') is not null
     or to_regprocedure('public.is_admin()') is not null or to_regprocedure('public.set_updated_at()') is not null then
    raise exception 'Cleanup check failed; rolled back.';
  end if;
end $pv$;

commit;

-- Read-only: what is left in schema public (expected: nothing until PriceViva is installed)
select 'left in public' as item, coalesce(string_agg(c.relname || ' (' || c.relkind::text || ')', ', '), 'nothing') as value
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','S','f','p')
union all
select 'functions left in public', coalesce(string_agg(p.proname, ', '), 'none')
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.oid not in (select objid from pg_depend where deptype = 'e');
