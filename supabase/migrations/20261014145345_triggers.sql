-- Database protections: updated_at, immutable user_id, field ownership (user_locked_fields),
-- automatic expiration recalculation, and the user-edit history log.

-- ---------------------------------------------------------------------------
-- Shared helpers (private schema, not reachable through the Data API)
-- ---------------------------------------------------------------------------

-- The only food_items fields the AI may set. Enforced inside the RPCs and the trigger below.
create or replace function private.ai_writable_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'name', 'brand', 'category', 'storage_location', 'quantity', 'unit', 'price_cents',
    'barcode', 'purchase_date', 'expiration_date', 'expiration_source', 'opened_at', 'notes'
  ]::text[];
$$;

-- Fields written to the history log: the AI-writable fields plus the status fields that
-- mark_used / mark_wasted change (needed so undo can restore them).
create or replace function private.loggable_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select private.ai_writable_fields() || array['status', 'consumed_at', 'wasted_at']::text[];
$$;

-- Who is making the current change. AI RPCs run set_config('app.edit_source', 'ai', true);
-- quick used/tossed actions use 'consume'; demo loading uses 'demo'; anything else is the user.
create or replace function private.edit_source()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.edit_source', true), ''), 'user');
$$;

create or replace function private.user_timezone(p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select p.timezone from public.profiles p where p.id = p_user_id), 'UTC');
$$;

create or replace function private.user_today(p_user_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone private.user_timezone(p_user_id))::date;
$$;

-- Best shelf_life row for an item: keyword match first (preferring the same category and the
-- longest keyword), then the category default for that storage location.
create or replace function private.match_shelf_life(
  p_name text,
  p_category public.food_category,
  p_location public.storage_location
)
returns public.shelf_life
language sql
stable
set search_path = ''
as $$
  select s.*
  from public.shelf_life s
  where s.storage_location = p_location
    and (
      (s.keyword is not null
        and lower(coalesce(p_name, '')) ~ ('(^|[^a-z])(' || s.keyword || ')($|[^a-z])'))
      or (s.keyword is null and s.category = p_category)
    )
  order by (s.keyword is null), (s.category = p_category) desc, length(s.keyword) desc nulls last
  limit 1;
$$;

-- Days an item keeps at a location, or null when nothing matches.
create or replace function private.shelf_life_days(
  p_name text,
  p_category public.food_category,
  p_location public.storage_location,
  p_opened boolean
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_opened and s.days_opened is not null then s.days_opened else s.days_unopened end
  from private.match_shelf_life(p_name, p_category, p_location) s;
$$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger food_items_set_updated_at
  before update on public.food_items
  for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_id can never change
-- ---------------------------------------------------------------------------
create or replace function private.prevent_user_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['food_items', 'scans', 'scan_items', 'ai_edit_log', 'recipes',
                           'push_subscriptions', 'reminder_log', 'ai_usage']
  loop
    execute format(
      'create trigger %I before update of user_id on public.%I for each row execute function private.prevent_user_id_change()',
      t || '_lock_user_id', t);
  end loop;
end
$$;

create or replace function private.prevent_profile_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profile id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_id
  before update of id on public.profiles
  for each row execute function private.prevent_profile_id_change();

-- ---------------------------------------------------------------------------
-- profiles: validate the timezone
-- ---------------------------------------------------------------------------
create or replace function private.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone "%"', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_validate
  before insert or update of timezone on public.profiles
  for each row execute function private.validate_profile();

-- Create a profile for every new auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := new.raw_user_meta_data ->> 'timezone';
begin
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.profiles (id, display_name, timezone)
  values (new.id, left(new.raw_user_meta_data ->> 'display_name', 80), v_tz)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- scan_items.include defaults to is_food (non-food lines start unchecked)
-- ---------------------------------------------------------------------------
create or replace function private.scan_items_default_include()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.include := coalesce(new.include, new.is_food);
  return new;
end;
$$;

create trigger scan_items_default_include
  before insert on public.scan_items
  for each row execute function private.scan_items_default_include();

-- ---------------------------------------------------------------------------
-- food_items BEFORE UPDATE: field ownership + derived fields
--
-- * When app.edit_source is not 'ai' (or 'consume'), every whitelisted field the update
--   changes is added to user_locked_fields. The AI RPCs skip locked fields from then on.
-- * AI edits may never change user_locked_fields.
-- * Moving an item into or out of the freezer, or opening it, recalculates expiration_date
--   from shelf_life unless the date is locked or is being set in the same update.
-- * quantity reaching 0 marks the item used; status changes stamp consumed_at / wasted_at.
-- ---------------------------------------------------------------------------
create or replace function private.food_items_before_update()
returns trigger
language plpgsql
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_source text := private.edit_source();
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_field text;
  v_days integer;
  v_base date;
  v_candidate date;
  v_tz text;
begin
  if v_source in ('ai', 'consume') then
    if new.user_locked_fields is distinct from old.user_locked_fields then
      raise exception 'AI edits cannot change user_locked_fields' using errcode = '42501';
    end if;
  else
    foreach v_field in array private.ai_writable_fields() loop
      if (v_new -> v_field) is distinct from (v_old -> v_field)
         and not (v_field = any (new.user_locked_fields)) then
        new.user_locked_fields := array_append(new.user_locked_fields, v_field);
      end if;
    end loop;
    -- A date the user typed in is a user date.
    if new.expiration_date is distinct from old.expiration_date
       and new.expiration_source is not distinct from old.expiration_source then
      new.expiration_source := 'user';
    end if;
  end if;

  -- Expiration recalculation from shelf_life.
  if new.status = 'active'
     and new.expiration_date is not distinct from old.expiration_date
     and not ('expiration_date' = any (old.user_locked_fields)) then
    v_tz := private.user_timezone(new.user_id);
    if new.storage_location = 'freezer' and old.storage_location <> 'freezer' then
      -- Frozen today: freezer storage time starts now.
      v_base := (now() at time zone v_tz)::date;
      v_days := private.shelf_life_days(new.name, new.category, 'freezer', false);
      if v_days is not null then
        new.expiration_date := v_base + v_days;
        new.expiration_source := 'shelf_life_table';
      end if;
    elsif old.storage_location = 'freezer' and new.storage_location <> 'freezer' then
      -- Thawed today: use the shorter of the new location's time and the remaining freezer time.
      v_base := (now() at time zone v_tz)::date;
      v_days := private.shelf_life_days(new.name, new.category, new.storage_location,
                                        new.opened_at is not null);
      if v_days is not null then
        v_candidate := v_base + v_days;
        new.expiration_date := least(coalesce(old.expiration_date, v_candidate), v_candidate);
        new.expiration_source := 'shelf_life_table';
      end if;
    elsif new.opened_at is not null and old.opened_at is null and new.storage_location <> 'freezer' then
      -- Opened: days_opened counts from the opening date; opening never extends the date.
      v_base := (new.opened_at at time zone v_tz)::date;
      v_days := private.shelf_life_days(new.name, new.category, new.storage_location, true);
      if v_days is not null then
        v_candidate := v_base + v_days;
        if old.expiration_date is null or v_candidate < old.expiration_date then
          new.expiration_date := v_candidate;
          new.expiration_source := 'shelf_life_table';
        end if;
      end if;
    end if;
    -- Never violate the 3-year window constraint because of a recalculation.
    if new.purchase_date is not null and new.expiration_date > (new.purchase_date + interval '3 years')::date then
      new.expiration_date := (new.purchase_date + interval '3 years')::date;
    end if;
  end if;

  -- Status bookkeeping.
  if new.status = 'active' and new.quantity = 0 and old.quantity > 0 then
    new.status := 'used';
  end if;
  if new.status = 'used' and old.status <> 'used' then
    new.consumed_at := coalesce(new.consumed_at, now());
  end if;
  if new.status = 'wasted' and old.status <> 'wasted' then
    new.wasted_at := coalesce(new.wasted_at, now());
  end if;

  return new;
end;
$$;

create trigger food_items_before_update
  before update on public.food_items
  for each row execute function private.food_items_before_update();

-- ---------------------------------------------------------------------------
-- food_items history for edits the user makes directly (AI RPCs log their own changes
-- with old/new values, confidence and model, so they are skipped here).
-- ---------------------------------------------------------------------------
create or replace function private.food_items_log_user_update()
returns trigger
language plpgsql
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_batch uuid := gen_random_uuid();
  v_field text;
  v_action public.edit_action;
begin
  if private.edit_source() <> 'user' then
    return null;
  end if;
  v_action := case
    when new.status = 'used' and old.status <> 'used' then 'mark_used'
    when new.status = 'wasted' and old.status <> 'wasted' then 'mark_wasted'
    else 'update'
  end;
  foreach v_field in array private.loggable_fields() loop
    if (v_new -> v_field) is distinct from (v_old -> v_field) then
      insert into public.ai_edit_log (user_id, batch_id, food_item_id, source, action, field, old_value, new_value)
      values (new.user_id, v_batch, new.id, 'user', v_action, v_field, v_old -> v_field, v_new -> v_field);
    end if;
  end loop;
  return null;
end;
$$;

create trigger food_items_log_user_update
  after update on public.food_items
  for each row execute function private.food_items_log_user_update();

create or replace function private.food_items_log_user_insert()
returns trigger
language plpgsql
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_snapshot jsonb := '{}';
  v_field text;
begin
  if private.edit_source() <> 'user' then
    return null;
  end if;
  foreach v_field in array private.ai_writable_fields() loop
    if v_new -> v_field is not null and v_new -> v_field <> 'null'::jsonb then
      v_snapshot := v_snapshot || jsonb_build_object(v_field, v_new -> v_field);
    end if;
  end loop;
  insert into public.ai_edit_log (user_id, batch_id, food_item_id, source, action, field, new_value)
  values (new.user_id, gen_random_uuid(), new.id, 'user', 'insert', null, v_snapshot);
  return null;
end;
$$;

create trigger food_items_log_user_insert
  after insert on public.food_items
  for each row execute function private.food_items_log_user_insert();

-- Helper functions are callable by the roles that run the RPCs, but they live in the
-- private schema, which the Data API does not expose.
revoke all on all functions in schema private from public, anon;
grant execute on function
  private.ai_writable_fields(), private.loggable_fields(), private.edit_source(),
  private.user_timezone(uuid), private.user_today(uuid),
  private.match_shelf_life(text, public.food_category, public.storage_location),
  private.shelf_life_days(text, public.food_category, public.storage_location, boolean)
  to authenticated, service_role;
