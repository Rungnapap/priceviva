-- =============================================================================
-- PriceViva accounts: saved products and price alerts for signed-in users (Supabase Auth).
-- Additive only: creates 3 tables and 6 functions; changes no existing data. Safe to run more than once.
--
-- Privacy and security:
--   * Passwords are handled only by Supabase Auth (auth.users). No password is ever stored here.
--   * Private rows carry user_id and are protected by row-level security: user_id = auth.uid().
--     Signed-in users can only see and change their own rows; the public (anon) key has no access at all.
--   * Deleting a user in Supabase Auth deletes their saved products, alerts and alert events (on delete cascade).
--   * price_alert_events and the pa_alert_* functions are server-only (secret key), for the e-mail worker.
--   * Signed-in users may only change the alert fields they own (target, currency, pause, e-mail on/off, names).
--     Server-managed fields (email_notified_*, created_at, updated_at, user_id, product, destination) are protected
--     twice: by column-level privileges and by the trigger pa_alerts_guard (which also keeps them correct).
--
-- Re-runs: every statement is idempotent, and re-running TIGHTENS permissions an earlier version granted
-- (table-level privileges are revoked and re-granted per column; our own policies are re-written in place).
-- =============================================================================

-- Pre-check: stop with a clear message, before changing anything, if a table with one of these names already
-- exists but is not PriceViva's (e.g. left over from another website). Nothing is dropped or altered here.
do $pv$
declare
  need jsonb := '{
    "user_saved_products": ["user_id","product_id","created_at"],
    "price_alerts": ["user_id","id","product_id","product_name","product_slug","target_minor","currency","destination","paused","email_enabled","email_notified_minor","email_notified_at","created_at","updated_at"],
    "price_alert_events": ["id","user_id","alert_id","price_minor","currency","retailer","status","detail","created_at","sent_at"]
  }';
  t text;
  missing text;
begin
  for t in select jsonb_object_keys(need) loop
    if to_regclass('public.' || t) is not null then
      select string_agg(c, ', ') into missing
        from jsonb_array_elements_text(need -> t) as c
       where not exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = t and column_name = c);
      if missing is not null then
        raise exception 'public.% already exists but is not PriceViva''s accounts table (missing columns: %). Nothing was changed. Send this message to Claude.', t, missing;
      end if;
    end if;
  end loop;
end $pv$;

create table if not exists public.user_saved_products (
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  text not null check (char_length(product_id) between 1 and 64),
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.price_alerts (
  user_id               uuid not null references auth.users(id) on delete cascade,
  id                    text not null check (id ~ '^[A-Za-z0-9-]{1,40}$'),
  product_id            text not null check (char_length(product_id) between 1 and 64),
  product_name          text not null check (char_length(product_name) between 1 and 200),
  product_slug          text not null check (char_length(product_slug) between 1 and 200),
  target_minor          bigint not null check (target_minor > 0 and target_minor < 1000000000000),
  currency              text not null check (currency in ('SEK','EUR','GBP','USD','NOK','DKK','CHF','CAD','AUD','JPY')),
  destination           text not null check (destination in ('SE','DE','GB')),
  paused                boolean not null default false,
  -- E-mail for this alert (the user can switch it off, also from the unsubscribe link in every alert e-mail).
  email_enabled         boolean not null default true,
  -- Set only by the server-side e-mail worker: the price we last e-mailed about (prevents duplicate e-mails).
  email_notified_minor  bigint,
  email_notified_at     timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, product_id, destination)
);
create index if not exists price_alerts_product_idx on public.price_alerts (product_id) where not paused and email_enabled;

-- Server-only log of price-drop e-mails (delivery status, errors). Never readable through the public API.
create table if not exists public.price_alert_events (
  id            uuid primary key default extensions.gen_random_uuid(),
  user_id       uuid not null,
  alert_id      text not null,
  price_minor   bigint not null,
  currency      text not null,
  retailer      text,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  detail        text check (detail is null or char_length(detail) <= 500),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  foreign key (user_id, alert_id) references public.price_alerts (user_id, id) on delete cascade
);
create index if not exists price_alert_events_alert_idx on public.price_alert_events (user_id, alert_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Row-level security and table permissions
-- -----------------------------------------------------------------------------
alter table public.user_saved_products enable row level security;
alter table public.price_alerts enable row level security;
alter table public.price_alert_events enable row level security;

-- Supabase grants everything on new tables to anon/authenticated by default: start from nothing. Revoking at table
-- level also removes any column-level privileges, so a re-run always ends in exactly the state below.
revoke all on public.user_saved_products, public.price_alerts, public.price_alert_events from public, anon, authenticated;

-- Saved products: read, add (only these two columns; created_at is set by the database), remove. No update.
grant select, delete on public.user_saved_products to authenticated;
grant insert (user_id, product_id) on public.user_saved_products to authenticated;

-- Alerts: read and delete own rows; insert and update ONLY the fields a customer manages.
-- Not writable by customers: email_notified_minor, email_notified_at (e-mail worker), created_at, updated_at
-- (database), and on update also user_id, id, product_id, destination (an alert stays the same alert).
grant select, delete on public.price_alerts to authenticated;
grant insert (user_id, id, product_id, product_name, product_slug, target_minor, currency, destination, paused, email_enabled)
  on public.price_alerts to authenticated;
grant update (product_name, product_slug, target_minor, currency, paused, email_enabled)
  on public.price_alerts to authenticated;
-- price_alert_events: no grants (server-only through security-definer functions).

-- Guard trigger (defence in depth, and keeps server fields correct): for signed-in users and the public key, the
-- server-managed fields can never be set or changed directly. A new target or currency clears the e-mail state so
-- the new target can notify. The e-mail worker's functions run as the table owner and are not restricted.
create or replace function public.pa_alerts_guard() returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.email_notified_minor := null;
      new.email_notified_at := null;
      new.created_at := now();
    else
      new.user_id := old.user_id;
      new.id := old.id;
      new.product_id := old.product_id;
      new.destination := old.destination;
      new.created_at := old.created_at;
      new.email_notified_minor := old.email_notified_minor;
      new.email_notified_at := old.email_notified_at;
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.target_minor is distinct from old.target_minor or new.currency is distinct from old.currency) then
    new.email_notified_minor := null;
    new.email_notified_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.pa_alerts_guard() from public, anon, authenticated;
create or replace trigger pa_alerts_guard
  before insert or update on public.price_alerts
  for each row execute function public.pa_alerts_guard();

do $pv$
declare pol record;
begin
  for pol in
    select * from (values
      ('user_saved_products', 'own saved products: read',   'select', 'using (user_id = (select auth.uid()))'),
      ('user_saved_products', 'own saved products: add',    'insert', 'with check (user_id = (select auth.uid()))'),
      ('user_saved_products', 'own saved products: remove', 'delete', 'using (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: read',   'select', 'using (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: add',    'insert', 'with check (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: change', 'update', 'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))'),
      ('price_alerts', 'own alerts: remove', 'delete', 'using (user_id = (select auth.uid()))')
    ) as v(tbl, name, cmd, expr)
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = pol.tbl and policyname = pol.name) then
      execute format('create policy %I on public.%I for %s to authenticated %s', pol.name, pol.tbl, pol.cmd, pol.expr);
    else
      -- Re-run: make sure our own policy has exactly this definition (an older version can't stay looser).
      execute format('alter policy %I on public.%I to authenticated %s', pol.name, pol.tbl, pol.expr);
    end if;
  end loop;
end $pv$;

-- -----------------------------------------------------------------------------
-- Signed-in user functions (SECURITY INVOKER: they run as the user, so row-level security applies)
-- -----------------------------------------------------------------------------
create or replace function public.pa_me_data(p jsonb) returns jsonb
language sql stable security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'saved', coalesce((select jsonb_agg(s.product_id order by s.created_at) from public.user_saved_products s
                        where s.user_id = (select auth.uid())), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'productId', a.product_id, 'productName', a.product_name, 'productSlug', a.product_slug,
        'targetMinor', a.target_minor, 'currency', a.currency, 'destination', a.destination, 'paused', a.paused,
        'emailEnabled', a.email_enabled, 'emailNotifiedMinor', a.email_notified_minor, 'emailNotifiedAt', a.email_notified_at,
        'createdAt', a.created_at) order by a.created_at)
      from public.price_alerts a where a.user_id = (select auth.uid())), '[]'::jsonb)
  )
$$;

-- Applies the browser's changes: {saved_add:[ids], saved_remove:[ids], alerts_upsert:[alert], alerts_remove:[ids]}.
-- Returns the user's full data afterwards. Limits: 200 saved products, 50 alerts.
create or replace function public.pa_me_sync(p jsonb) returns jsonb
language plpgsql security invoker
set search_path = public, extensions
as $$
declare
  uid uuid := (select auth.uid());
  a jsonb;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;
  if jsonb_typeof(coalesce(p->'saved_add', '[]')) <> 'array' or jsonb_typeof(coalesce(p->'saved_remove', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p->'alerts_upsert', '[]')) <> 'array' or jsonb_typeof(coalesce(p->'alerts_remove', '[]')) <> 'array' then
    raise exception 'Invalid request.' using errcode = '22023';
  end if;

  delete from public.user_saved_products
   where user_id = uid and product_id in (select jsonb_array_elements_text(coalesce(p->'saved_remove', '[]')));
  insert into public.user_saved_products (user_id, product_id)
  select uid, x from jsonb_array_elements_text(coalesce(p->'saved_add', '[]')) as x
   where char_length(x) between 1 and 64
  on conflict do nothing;
  if (select count(*) from public.user_saved_products where user_id = uid) > 200 then
    raise exception 'You can save up to 200 products.' using errcode = '54000';
  end if;

  delete from public.price_alerts
   where user_id = uid and id in (select jsonb_array_elements_text(coalesce(p->'alerts_remove', '[]')));
  for a in select * from jsonb_array_elements(coalesce(p->'alerts_upsert', '[]')) loop
    -- One alert per product and delivery country: a newer alert replaces an older one from another device.
    delete from public.price_alerts
     where user_id = uid and product_id = a->>'productId' and destination = a->>'destination' and id <> a->>'id';
    insert into public.price_alerts (user_id, id, product_id, product_name, product_slug, target_minor, currency, destination, paused, email_enabled)
    values (uid, a->>'id', a->>'productId', left(a->>'productName', 200), left(a->>'productSlug', 200), (a->>'targetMinor')::bigint,
            a->>'currency', a->>'destination', coalesce((a->>'paused')::boolean, false), coalesce((a->>'emailEnabled')::boolean, true))
    on conflict (user_id, id) do update set
      product_name = excluded.product_name,
      product_slug = excluded.product_slug,
      target_minor = excluded.target_minor,
      currency     = excluded.currency,
      paused       = excluded.paused,
      email_enabled = excluded.email_enabled;
      -- (pa_alerts_guard clears the e-mail state when the target or currency changes, and sets updated_at.)
  end loop;
  if (select count(*) from public.price_alerts where user_id = uid) > 50 then
    raise exception 'You can have up to 50 price alerts.' using errcode = '54000';
  end if;

  return public.pa_me_data('{}'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- Server-only functions for the price-alert e-mail worker (secret key only)
-- -----------------------------------------------------------------------------
-- Alerts that may need an e-mail: active, e-mail on, and the account's e-mail address confirmed.
create or replace function public.pa_alerts_due(p jsonb) returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(x order by x->>'createdAt'), '[]'::jsonb) from (
    select jsonb_build_object(
      'userId', a.user_id, 'id', a.id, 'productId', a.product_id, 'productName', a.product_name, 'productSlug', a.product_slug,
      'targetMinor', a.target_minor, 'currency', a.currency, 'destination', a.destination,
      'emailNotifiedMinor', a.email_notified_minor, 'email', u.email, 'createdAt', a.created_at) as x
    from public.price_alerts a
    join auth.users u on u.id = a.user_id
    where not a.paused and a.email_enabled and u.email is not null and u.email_confirmed_at is not null
    order by a.created_at
    limit least(greatest(coalesce((p->>'limit')::int, 500), 1), 2000)
  ) s
$$;

-- Records what the worker saw for one alert. Atomic, so two workers can never e-mail the same drop twice:
--   best above target -> reset (a later drop may notify again); best at/below target and lower than the last
--   e-mailed price -> 'notify' with a new pending event; otherwise 'none'.
create or replace function public.pa_alert_observe(p jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  best bigint := (p->>'best_minor')::bigint;
  a public.price_alerts;
  ev uuid;
begin
  select * into a from public.price_alerts where user_id = (p->>'user_id')::uuid and id = p->>'alert_id' for update;
  if not found or best is null then return jsonb_build_object('action', 'none'); end if;
  if best > a.target_minor then
    if a.email_notified_minor is not null then
      update public.price_alerts set email_notified_minor = null, email_notified_at = null where user_id = a.user_id and id = a.id;
      return jsonb_build_object('action', 'reset');
    end if;
    return jsonb_build_object('action', 'none');
  end if;
  if a.paused or not a.email_enabled or (a.email_notified_minor is not null and best >= a.email_notified_minor) then
    return jsonb_build_object('action', 'none');
  end if;
  update public.price_alerts set email_notified_minor = best, email_notified_at = now() where user_id = a.user_id and id = a.id;
  insert into public.price_alert_events (user_id, alert_id, price_minor, currency, retailer)
  values (a.user_id, a.id, best, a.currency, left(p->>'retailer', 200)) returning id into ev;
  return jsonb_build_object('action', 'notify', 'event_id', ev);
end $$;

create or replace function public.pa_alert_event_update(p jsonb) returns jsonb
language sql security definer
set search_path = public, extensions
as $$
  update public.price_alert_events
     set status = p->>'status', detail = left(p->>'detail', 500), sent_at = case when p->>'status' = 'sent' then now() else sent_at end
   where id = (p->>'event_id')::uuid and p->>'status' in ('sent', 'failed', 'skipped')
  returning jsonb_build_object('ok', true)
$$;

-- Unsubscribe link in alert e-mails (the link is signed by the server): switches e-mail off for that alert.
create or replace function public.pa_alert_unsubscribe(p jsonb) returns jsonb
language sql security definer
set search_path = public, extensions
as $$
  with u as (
    update public.price_alerts set email_enabled = false, updated_at = now()
     where user_id = (p->>'user_id')::uuid and id = p->>'alert_id'
    returning product_name
  )
  select coalesce((select jsonb_build_object('ok', true, 'productName', product_name) from u), jsonb_build_object('ok', false))
$$;

-- -----------------------------------------------------------------------------
-- Function permissions
-- -----------------------------------------------------------------------------
do $pv$
declare fn text;
begin
  foreach fn in array array['pa_me_data', 'pa_me_sync'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon', fn);
    execute format('grant execute on function public.%I(jsonb) to authenticated', fn);
  end loop;
  foreach fn in array array['pa_alerts_due', 'pa_alert_observe', 'pa_alert_event_update', 'pa_alert_unsubscribe'] loop
    execute format('revoke all on function public.%I(jsonb) from public, anon, authenticated', fn);
    execute format('grant execute on function public.%I(jsonb) to service_role', fn);
  end loop;
end $pv$;
