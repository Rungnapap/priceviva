-- =============================================================================
-- Old website cleanup — STEP 3: remove the leftover sequence public.service_request_ref_seq  *** PERMANENT ***
-- Removes exactly ONE object. No CASCADE. One transaction: any error or failed check rolls everything back.
--
-- Stops with nothing changed if:
--   * the object is missing, or is not a sequence in schema public;
--   * it belongs to an extension, or is owned by a table column;
--   * anything depends on it (column defaults, views, other objects tracked by PostgreSQL);
--   * any function, trigger or policy text mentions it (PL/pgSQL bodies are not tracked as dependencies);
--   * any PriceViva table already exists (this cleanup belongs before the PriceViva install).
-- =============================================================================
begin;

do $pv$
declare
  seq oid := to_regclass('public.service_request_ref_seq');
  found text;
begin
  if seq is null then
    raise exception 'Stopped, nothing changed: public.service_request_ref_seq does not exist (already removed?).';
  end if;
  if (select relkind from pg_class where oid = seq) <> 'S' then
    raise exception 'Stopped, nothing changed: public.service_request_ref_seq is not a sequence.';
  end if;

  -- Part of an extension? (Supabase/extension objects are never touched)
  if exists (select 1 from pg_depend where classid = 'pg_class'::regclass and objid = seq and deptype = 'e') then
    raise exception 'Stopped, nothing changed: the sequence belongs to an extension.';
  end if;

  -- Owned by a column (OWNED BY / serial / identity)?
  select string_agg(pg_describe_object(refclassid, refobjid, refobjsubid), ', ') into found
    from pg_depend where classid = 'pg_class'::regclass and objid = seq and deptype in ('a', 'i');
  if found is not null then
    raise exception 'Stopped, nothing changed: the sequence is owned by %.', found;
  end if;

  -- Anything that depends on it (column defaults, views, ...)
  select string_agg(pg_describe_object(classid, objid, objsubid), ', ') into found
    from pg_depend where refclassid = 'pg_class'::regclass and refobjid = seq and deptype <> 'i';
  if found is not null then
    raise exception 'Stopped, nothing changed: still used by %.', found;
  end if;

  -- Mentions in function bodies or policy expressions (not tracked as dependencies)
  select string_agg(n.nspname || '.' || p.proname || '()', ', ') into found
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ilike '%service_request_ref_seq%';
  if found is not null then
    raise exception 'Stopped, nothing changed: function(s) mention the sequence: %.', found;
  end if;
  select string_agg(schemaname || '.' || tablename || ' -> ' || policyname, ', ') into found
    from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ilike '%service_request_ref_seq%';
  if found is not null then
    raise exception 'Stopped, nothing changed: policy/policies mention the sequence: %.', found;
  end if;

  -- Order check: PriceViva not installed yet
  if to_regclass('public.offers') is not null or to_regclass('public.variants') is not null then
    raise exception 'Stopped, nothing changed: PriceViva tables already exist. Send this message to Claude before continuing.';
  end if;
end $pv$;

-- Default behaviour is RESTRICT: PostgreSQL refuses if anything still depends on it.
drop sequence public.service_request_ref_seq;

do $pv$
begin
  if to_regclass('public.service_request_ref_seq') is not null then
    raise exception 'Cleanup check failed; rolled back.';
  end if;
end $pv$;

commit;

-- Read-only: what is left in schema public (expected: nothing, before PriceViva is installed)
select 'left in public' as item, coalesce(string_agg(c.relname || ' (' || c.relkind::text || ')', ', '), 'nothing') as value
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','S','f','p')
   and c.oid not in (select objid from pg_depend where deptype = 'e')
union all
select 'functions left in public', coalesce(string_agg(p.proname, ', '), 'none')
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.oid not in (select objid from pg_depend where deptype = 'e');
