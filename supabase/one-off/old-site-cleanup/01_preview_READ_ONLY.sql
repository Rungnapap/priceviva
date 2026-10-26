-- =============================================================================
-- Old website cleanup — STEP 1: PREVIEW (read-only, changes nothing)
-- Lists exactly what STEP 2 would remove, and anything outside those objects that still refers to them.
-- Paste into Supabase -> SQL Editor -> Run, and send the result (Download CSV) before running step 2.
-- Shows names and settings only, never row contents.
-- =============================================================================
with
old_tables(t) as (values ('admin_users'), ('company_settings'), ('request_rate_limits'), ('service_requests')),
old_rel as (select c.oid, c.relname from pg_class c join old_tables o on o.t = c.relname where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')),
old_fn as (select p.oid, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname in ('is_admin', 'set_updated_at')),
ext_objs as (select objid from pg_depend where deptype = 'e')
select * from (
  -- A. What step 2 removes directly
  select 1 as ord, 'WILL REMOVE: table' as what, 'public.' || r.relname as name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', r.relname), false, true, '')))[1]::text || ' rows' as detail
    from old_rel r
  union all
  select 2, 'WILL REMOVE: function', 'public.' || f.sig, 'security definer: ' || (select prosecdef from pg_proc where oid = f.oid)::text from old_fn f
  -- B. Removed automatically together with the tables
  union all
  select 3, 'removed with its table: trigger', 'public.' || r.relname || ' -> ' || tg.tgname, 'calls ' || tg.tgfoid::regproc::text
    from pg_trigger tg join old_rel r on r.oid = tg.tgrelid where not tg.tgisinternal
  union all
  select 4, 'removed with its table: RLS policy', 'public.' || pol.tablename || ' -> ' || pol.policyname, pol.cmd || ' for ' || array_to_string(pol.roles, ',')
    from pg_policies pol join old_tables o on o.t = pol.tablename where pol.schemaname = 'public'
  union all
  select 5, 'removed with its table: API grant', 'public.' || g.table_name, g.grantee || ': ' || string_agg(g.privilege_type, ',' order by g.privilege_type)
    from information_schema.role_table_grants g join old_tables o on o.t = g.table_name
   where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'service_role')
   group by g.table_name, g.grantee
  union all
  select 6, 'removed with its table: constraint/index/sequence', 'public.' || r.relname || ' -> ' || d.objname, d.kind
    from old_rel r cross join lateral (
      select con.conname::text as objname, case con.contype when 'p' then 'primary key' when 'f' then 'foreign key -> ' || con.confrelid::regclass::text
             when 'u' then 'unique' when 'c' then 'check' else con.contype::text end as kind
        from pg_constraint con where con.conrelid = r.oid
      union all
      select s.relname::text, 'sequence owned by a column' from pg_depend dp join pg_class s on s.oid = dp.objid
       where dp.refobjid = r.oid and s.relkind = 'S' and dp.deptype in ('a', 'i')
    ) d
  -- C. BLOCKERS: things outside the list that depend on the old objects. Step 2 stops (and changes nothing) if any exist.
  union all
  select 7, 'BLOCKER: depends on an old object', pg_describe_object(dp.classid, dp.objid, dp.objsubid),
         'depends on ' || pg_describe_object(dp.refclassid, dp.refobjid, dp.refobjsubid)
    from pg_depend dp
   where (dp.refobjid in (select oid from old_rel) or dp.refobjid in (select oid from old_fn))
     and dp.deptype = 'n'
     and not (dp.classid = 'pg_class'::regclass and dp.objid in (select oid from old_rel))
     and not exists (select 1 from pg_trigger tg where tg.oid = dp.objid and dp.classid = 'pg_trigger'::regclass and tg.tgrelid in (select oid from old_rel))
     and not exists (select 1 from pg_policy po where po.oid = dp.objid and dp.classid = 'pg_policy'::regclass and po.polrelid in (select oid from old_rel))
     and not exists (select 1 from pg_constraint co where co.oid = dp.objid and dp.classid = 'pg_constraint'::regclass and co.conrelid in (select oid from old_rel))
     and not exists (select 1 from pg_attrdef ad where ad.oid = dp.objid and dp.classid = 'pg_attrdef'::regclass and ad.adrelid in (select oid from old_rel))
     and not exists (select 1 from pg_rewrite rw where rw.oid = dp.objid and dp.classid = 'pg_rewrite'::regclass and rw.ev_class in (select oid from old_rel))
  union all
  -- D. Text mentions elsewhere (not tracked as dependencies): other functions or policies that call the old functions
  select 8, 'CHECK: mentions an old name', n.nspname || '.' || p.proname || '()', 'function body mentions is_admin / set_updated_at / an old table'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.oid not in (select oid from old_fn) and p.oid not in (select objid from ext_objs)
     and n.nspname in ('public', 'auth', 'storage')
     and p.prosrc ~ '(is_admin|set_updated_at|admin_users|company_settings|request_rate_limits|service_requests)'
  union all
  select 9, 'CHECK: policy elsewhere mentions an old name', pol.schemaname || '.' || pol.tablename || ' -> ' || pol.policyname, pol.cmd
    from pg_policies pol
   where not (pol.schemaname = 'public' and pol.tablename in (select t from old_tables))
     and coalesce(pol.qual, '') || coalesce(pol.with_check, '') ~ '(is_admin|admin_users|company_settings|request_rate_limits|service_requests)'
  union all
  select 10, 'CHECK: trigger on auth/storage', tg.event_object_schema || '.' || tg.event_object_table || ' -> ' || tg.trigger_name, left(tg.action_statement, 120)
    from information_schema.triggers tg where tg.event_object_schema in ('auth', 'storage')
  -- E. Everything else in schema public that step 2 does NOT touch (should be empty before PriceViva is installed)
  union all
  select 11, 'NOT TOUCHED: other object in public', c.relname,
         case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' when 'f' then 'foreign table' when 'p' then 'partitioned table' end
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','S','f','p')
     and c.oid not in (select oid from old_rel) and c.oid not in (select objid from ext_objs)
     and not exists (select 1 from pg_depend dp where dp.objid = c.oid and dp.refobjid in (select oid from old_rel) and dp.deptype in ('a','i'))
  union all
  select 12, 'NOT TOUCHED: other function in public', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ''
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.oid not in (select oid from old_fn) and p.oid not in (select objid from ext_objs)
  union all
  select 13, 'NOT TOUCHED: type in public', t.typname, case t.typtype when 'e' then 'enum' when 'd' then 'domain' when 'c' then 'composite' end
    from pg_type t
   where t.typnamespace = 'public'::regnamespace and t.typtype in ('e','d') and t.oid not in (select objid from ext_objs)
  union all
  select 14, 'auth users (count only)', 'auth.users', (select count(*) from auth.users)::text
) preview
order by ord, name;
