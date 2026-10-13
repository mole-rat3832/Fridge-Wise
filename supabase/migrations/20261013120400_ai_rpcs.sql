-- How the AI edits the database.
--
--   model output -> Zod validation -> normalization -> staging / proposed change
--   -> (user review) -> one of these RPCs, which applies the change in one transaction and logs it.
--
-- The RPCs run as SECURITY INVOKER, so Row Level Security decides which rows they can see.
-- They set app.edit_source = 'ai' so the field-ownership trigger does not lock fields the AI
-- writes, and they skip every field the user has locked.

-- ---------------------------------------------------------------------------
-- Logging helper: one ai_edit_log row per field that differs between two versions of an item.
-- ---------------------------------------------------------------------------
create or replace function private.log_item_diff(
  p_batch_id uuid,
  p_old public.food_items,
  p_new public.food_items,
  p_source public.edit_log_source,
  p_action public.edit_action,
  p_confidence numeric,
  p_model text,
  p_reason text
)
returns integer
language plpgsql
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_old jsonb := to_jsonb(p_old);
  v_new jsonb := to_jsonb(p_new);
  v_field text;
  v_count integer := 0;
begin
  foreach v_field in array private.loggable_fields() loop
    if (v_new -> v_field) is distinct from (v_old -> v_field) then
      insert into public.ai_edit_log (user_id, batch_id, food_item_id, source, action, field,
                                      old_value, new_value, confidence, model, reason)
      values (p_new.user_id, p_batch_id, p_new.id, p_source, p_action, v_field,
              v_old -> v_field, v_new -> v_field, p_confidence, p_model, p_reason);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared consumption logic for mark_used / mark_wasted (AI batches and quick actions).
-- Consumption is an operation the user confirmed, not a value the AI picked, so it applies
-- even when quantity is locked.
-- ---------------------------------------------------------------------------
create or replace function private.consume_item(
  p_item public.food_items,
  p_kind text,
  p_amount numeric
)
returns public.food_items
language plpgsql
set search_path = ''
as $$
declare
  v_after public.food_items;
begin
  if p_kind = 'mark_used' then
    if p_amount is not null and p_amount <= 0 then
      raise exception 'Amount used must be greater than 0' using errcode = '22023';
    end if;
    if p_amount is null or p_amount >= p_item.quantity then
      update public.food_items
        set quantity = 0, status = 'used', consumed_at = now()
        where id = p_item.id
        returning * into v_after;
    else
      update public.food_items
        set quantity = quantity - p_amount
        where id = p_item.id
        returning * into v_after;
    end if;
  elsif p_kind = 'mark_wasted' then
    update public.food_items
      set status = 'wasted', wasted_at = now()
      where id = p_item.id
      returning * into v_after;
  else
    raise exception 'Unknown consumption "%"', p_kind using errcode = '22023';
  end if;
  return v_after;
end;
$$;

-- Expiration for a brand-new item when none was given: shelf_life first, otherwise null.
create or replace function private.default_expiration(
  p_name text,
  p_category public.food_category,
  p_location public.storage_location,
  p_base date
)
returns date
language sql
stable
set search_path = ''
as $$
  select p_base + private.shelf_life_days(p_name, p_category, p_location, false);
$$;

-- ---------------------------------------------------------------------------
-- shelf_life_lookup(items jsonb) -> jsonb
-- items: [{name, category, storage_location, opened}] -> [{index, days, keyword, matched_by}]
-- Used by scan-image (expiration priority step b) and by the Add Item form.
-- ---------------------------------------------------------------------------
create or replace function public.shelf_life_lookup(p_items jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'index', (i.ord - 1)::int,
      'days', case
                when coalesce((i.e ->> 'opened')::boolean, false) and s.days_opened is not null
                  then s.days_opened
                else s.days_unopened
              end,
      'keyword', s.keyword,
      'matched_by', case when s.id is null then null when s.keyword is null then 'category' else 'keyword' end
    ) order by i.ord), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
       with ordinality as i(e, ord)
  left join lateral private.match_shelf_life(
      i.e ->> 'name',
      coalesce(nullif(i.e ->> 'category', ''), 'other')::public.food_category,
      coalesce(nullif(i.e ->> 'storage_location', ''), 'fridge')::public.storage_location
    ) s on true;
$$;

-- ---------------------------------------------------------------------------
-- confirm_scan(scan_id, items jsonb)
-- items: [{scan_item_id, include, name, brand, category, storage_location, quantity, unit,
--          price_cents, barcode, purchase_date, expiration_date, notes}]
-- Inserts food_items from the user's final values, logs one insert entry per field the AI filled,
-- locks every field the user changed during review, links scan_items, marks the scan confirmed.
-- Each confirmed item is always a new row (a new batch), never merged into an existing item.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_scan(p_scan_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_uid uuid := auth.uid();
  v_scan public.scans;
  v_si public.scan_items;
  v_in jsonb;
  v_ai jsonb;
  v_final jsonb;
  v_locked text[];
  v_field text;
  v_item public.food_items;
  v_row public.food_items;
  v_batch uuid := gen_random_uuid();
  v_created uuid[] := '{}';
  v_today date;
  v_source public.edit_log_source;
  v_prev_source text := current_setting('app.edit_source', true);
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;

  select * into v_scan from public.scans where id = p_scan_id for update;
  if not found then
    raise exception 'Scan not found' using errcode = 'P0002';
  end if;
  if v_scan.status <> 'needs_review' then
    raise exception 'This scan is not waiting for review (status: %)', v_scan.status using errcode = '55000';
  end if;

  perform set_config('app.edit_source', 'ai', true);
  v_today := private.user_today(v_uid);

  for v_in in select value from jsonb_array_elements(p_items) loop
    select * into v_si
      from public.scan_items
      where id = (v_in ->> 'scan_item_id')::uuid and scan_id = p_scan_id;
    if not found then
      raise exception 'Scan item % does not belong to this scan', v_in ->> 'scan_item_id' using errcode = 'P0002';
    end if;

    update public.scan_items
      set include = coalesce((v_in ->> 'include')::boolean, v_si.include)
      where id = v_si.id;

    if not coalesce((v_in ->> 'include')::boolean, v_si.include) then
      continue;
    end if;

    -- What the AI proposed, keyed by food_items column names.
    v_ai := jsonb_build_object(
      'name', v_si.name,
      'brand', v_si.brand,
      'category', v_si.category,
      'storage_location', v_si.storage_location,
      'quantity', v_si.quantity,
      'unit', v_si.unit,
      'price_cents', case when v_si.price_cents >= 0 then v_si.price_cents end,
      'barcode', v_si.barcode,
      'purchase_date', coalesce(v_scan.purchase_date, v_today),
      'expiration_date', v_si.estimated_expiration_date,
      'expiration_source', v_si.expiration_source,
      'opened_at', null,
      'notes', coalesce(v_si.notes, v_si.storage_instructions)
    );

    -- The user's final values win. Only whitelisted keys are read from the payload.
    v_final := v_ai;
    for v_field in select jsonb_object_keys(v_in) loop
      if v_field = any (private.ai_writable_fields()) and v_field <> 'expiration_source' then
        v_final := v_final || jsonb_build_object(v_field, v_in -> v_field);
      end if;
    end loop;

    v_locked := '{}';
    foreach v_field in array private.ai_writable_fields() loop
      if v_field <> 'expiration_source'
         and coalesce(v_final -> v_field, 'null'::jsonb) is distinct from coalesce(v_ai -> v_field, 'null'::jsonb) then
        v_locked := array_append(v_locked, v_field);
      end if;
    end loop;
    if 'expiration_date' = any (v_locked) then
      v_final := v_final || jsonb_build_object('expiration_source', 'user');
      v_locked := array_append(v_locked, 'expiration_source');
    end if;

    v_row := jsonb_populate_record(null::public.food_items, v_final);

    insert into public.food_items (
      user_id, name, brand, category, storage_location, quantity, unit, purchase_date,
      expiration_date, expiration_source, opened_at, price_cents, barcode, notes,
      image_path, scan_item_id, ai_confidence, user_locked_fields
    ) values (
      v_uid, btrim(v_row.name), nullif(btrim(v_row.brand), ''),
      coalesce(v_row.category, 'other'), coalesce(v_row.storage_location, 'fridge'),
      coalesce(v_row.quantity, 1), coalesce(v_row.unit, 'count'), coalesce(v_row.purchase_date, v_today),
      v_row.expiration_date, case when v_row.expiration_date is null then null else v_row.expiration_source end,
      v_row.opened_at, v_row.price_cents, nullif(v_row.barcode, ''), nullif(btrim(v_row.notes), ''),
      v_scan.image_path, v_si.id, v_si.confidence, v_locked
    )
    returning * into v_item;

    -- One insert entry per filled field: AI-filled fields as ai_scan (with confidence),
    -- fields the user changed during review as user.
    foreach v_field in array private.ai_writable_fields() loop
      if to_jsonb(v_item) -> v_field is not null and to_jsonb(v_item) -> v_field <> 'null'::jsonb then
        v_source := case when v_field = any (v_locked) then 'user' else 'ai_scan' end;
        insert into public.ai_edit_log (user_id, batch_id, food_item_id, scan_id, source, action, field,
                                        old_value, new_value, confidence, model)
        values (v_uid, v_batch, v_item.id, p_scan_id, v_source, 'insert', v_field,
                null, to_jsonb(v_item) -> v_field,
                case when v_source = 'ai_scan' then (v_si.field_confidence ->> v_field)::numeric end,
                case when v_source = 'ai_scan' then v_scan.model end);
      end if;
    end loop;

    update public.scan_items set created_food_item_id = v_item.id where id = v_si.id;
    v_created := array_append(v_created, v_item.id);
  end loop;

  update public.scans
    set status = 'confirmed', confirmed_at = now()
    where id = p_scan_id;

  perform set_config('app.edit_source', coalesce(v_prev_source, ''), true);
  return jsonb_build_object(
    'batch_id', v_batch,
    'created_item_ids', to_jsonb(v_created),
    'created_count', coalesce(array_length(v_created, 1), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_ai_changes(batch jsonb, source, model)
-- batch: {operations: [...]} or a bare array of operations:
--   {op: "update",      item_id, changes: {field: value, ...}, reason, confidence}
--   {op: "mark_used",   item_id, amount (null = all), reason, confidence}
--   {op: "mark_wasted", item_id, reason, confidence}
--   {op: "create",      item: {field: value, ...}, reason, confidence}
-- Enforces the whitelist, relies on RLS for ownership, skips locked fields, writes one
-- ai_edit_log row per changed field under a single batch_id, all in one transaction.
-- There is no delete operation.
-- ---------------------------------------------------------------------------
create or replace function public.apply_ai_changes(
  p_batch jsonb,
  p_source public.edit_log_source,
  p_model text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_ops jsonb;
  v_op jsonb;
  v_kind text;
  v_item public.food_items;
  v_after public.food_items;
  v_changes jsonb;
  v_allowed jsonb;
  v_key text;
  v_set text;
  v_reason text;
  v_conf numeric;
  v_skipped jsonb := '[]';
  v_applied jsonb := '[]';
  v_whitelist text[] := private.ai_writable_fields();
  v_new public.food_items;
  v_today date;
  v_logged integer;
  v_prev_source text := current_setting('app.edit_source', true);
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_source not in ('ai_command', 'ai_recipe') then
    raise exception 'apply_ai_changes only accepts ai_command or ai_recipe batches' using errcode = '22023';
  end if;

  v_ops := case jsonb_typeof(p_batch)
             when 'array' then p_batch
             when 'object' then p_batch -> 'operations'
           end;
  if v_ops is null or jsonb_typeof(v_ops) <> 'array' or jsonb_array_length(v_ops) = 0 then
    raise exception 'The batch has no operations' using errcode = '22023';
  end if;
  if jsonb_array_length(v_ops) > 50 then
    raise exception 'A batch can contain at most 50 operations' using errcode = '22023';
  end if;

  perform set_config('app.edit_source', 'ai', true);
  v_today := private.user_today(v_uid);

  for v_op in select value from jsonb_array_elements(v_ops) loop
    v_kind := v_op ->> 'op';
    v_reason := left(nullif(btrim(v_op ->> 'reason'), ''), 300);
    v_conf := case when jsonb_typeof(v_op -> 'confidence') = 'number'
                   then least(greatest((v_op ->> 'confidence')::numeric, 0), 1) end;

    -- ---- create -------------------------------------------------------------
    if v_kind = 'create' then
      v_changes := v_op -> 'item';
      if v_changes is null or jsonb_typeof(v_changes) <> 'object' then
        raise exception 'create needs an item object' using errcode = '22023';
      end if;
      for v_key in select jsonb_object_keys(v_changes) loop
        if not (v_key = any (v_whitelist)) then
          raise exception 'Field "%" is not AI-writable', v_key using errcode = '42501';
        end if;
      end loop;
      v_new := jsonb_populate_record(null::public.food_items, v_changes);
      if v_new.name is null or btrim(v_new.name) = '' then
        raise exception 'create needs a name' using errcode = '22023';
      end if;

      insert into public.food_items (
        user_id, name, brand, category, storage_location, quantity, unit, purchase_date,
        expiration_date, expiration_source, opened_at, price_cents, barcode, notes
      ) values (
        v_uid, btrim(v_new.name), nullif(btrim(v_new.brand), ''),
        coalesce(v_new.category, 'other'), coalesce(v_new.storage_location, 'fridge'),
        coalesce(v_new.quantity, 1), coalesce(v_new.unit, 'count'), coalesce(v_new.purchase_date, v_today),
        coalesce(v_new.expiration_date,
                 private.default_expiration(v_new.name, coalesce(v_new.category, 'other'),
                                            coalesce(v_new.storage_location, 'fridge'),
                                            coalesce(v_new.purchase_date, v_today))),
        case
          when v_new.expiration_date is not null then coalesce(v_new.expiration_source, 'ai_command')
          when private.default_expiration(v_new.name, coalesce(v_new.category, 'other'),
                                          coalesce(v_new.storage_location, 'fridge'),
                                          coalesce(v_new.purchase_date, v_today)) is not null
            then 'shelf_life_table'
        end,
        v_new.opened_at, v_new.price_cents, nullif(v_new.barcode, ''), nullif(btrim(v_new.notes), '')
      )
      returning * into v_after;

      foreach v_key in array v_whitelist loop
        if to_jsonb(v_after) -> v_key is not null and to_jsonb(v_after) -> v_key <> 'null'::jsonb then
          insert into public.ai_edit_log (user_id, batch_id, food_item_id, source, action, field,
                                          old_value, new_value, confidence, model, reason)
          values (v_uid, v_batch_id, v_after.id, p_source, 'insert', v_key,
                  null, to_jsonb(v_after) -> v_key, v_conf, p_model, v_reason);
        end if;
      end loop;
      v_applied := v_applied || jsonb_build_object('op', 'create', 'item_id', v_after.id, 'name', v_after.name);
      continue;
    end if;

    -- ---- operations on an existing item -------------------------------------
    if v_op ->> 'item_id' is null then
      raise exception '% needs an item_id', coalesce(v_kind, 'operation') using errcode = '22023';
    end if;

    -- RLS limits this to the caller's own rows.
    select * into v_item from public.food_items where id = (v_op ->> 'item_id')::uuid for update;
    if not found then
      raise exception 'Item % not found', v_op ->> 'item_id' using errcode = 'P0002';
    end if;
    if v_item.status <> 'active' then
      v_skipped := v_skipped || jsonb_build_object(
        'item_id', v_item.id, 'name', v_item.name, 'op', v_kind, 'field', null,
        'reason', 'not_active');
      continue;
    end if;

    if v_kind = 'update' then
      v_changes := coalesce(v_op -> 'changes', '{}'::jsonb);
      if jsonb_typeof(v_changes) <> 'object' then
        raise exception 'update needs a changes object' using errcode = '22023';
      end if;
      v_allowed := '{}';
      for v_key in select jsonb_object_keys(v_changes) loop
        if not (v_key = any (v_whitelist)) then
          raise exception 'Field "%" is not AI-writable', v_key using errcode = '42501';
        end if;
        if v_key = any (v_item.user_locked_fields) then
          v_skipped := v_skipped || jsonb_build_object(
            'item_id', v_item.id, 'name', v_item.name, 'op', 'update', 'field', v_key,
            'reason', 'locked');
        else
          v_allowed := v_allowed || jsonb_build_object(v_key, v_changes -> v_key);
        end if;
      end loop;

      if v_allowed ? 'expiration_date' and not (v_allowed ? 'expiration_source')
         and not ('expiration_source' = any (v_item.user_locked_fields)) then
        v_allowed := v_allowed || jsonb_build_object('expiration_source', 'ai_command');
      end if;

      if v_allowed = '{}'::jsonb then
        continue;
      end if;

      select string_agg(format('%I = ($1).%I', k, k), ', ')
        into v_set
        from jsonb_object_keys(v_allowed) as k;

      execute format('update public.food_items set %s where id = $2 returning *', v_set)
        into v_after
        using jsonb_populate_record(v_item, v_allowed), v_item.id;

    elsif v_kind in ('mark_used', 'mark_wasted') then
      v_after := private.consume_item(
        v_item, v_kind,
        case when jsonb_typeof(v_op -> 'amount') = 'number' then (v_op ->> 'amount')::numeric end);
    else
      raise exception 'Unknown operation "%"', coalesce(v_kind, 'null') using errcode = '22023';
    end if;

    v_logged := private.log_item_diff(
      v_batch_id, v_item, v_after, p_source,
      case when v_kind = 'update' then 'update'::public.edit_action else v_kind::public.edit_action end,
      v_conf, p_model, v_reason);

    if v_logged > 0 then
      v_applied := v_applied || jsonb_build_object('op', v_kind, 'item_id', v_item.id, 'name', v_item.name);
    end if;
  end loop;

  perform set_config('app.edit_source', coalesce(v_prev_source, ''), true);
  return jsonb_build_object(
    'batch_id', case when jsonb_array_length(v_applied) > 0 then v_batch_id end,
    'applied', v_applied,
    'skipped', v_skipped
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_item_use / record_item_waste: the dashboard's quick "used" and "tossed" buttons
-- and the item page's full/partial use. Logged as source 'user' and undoable.
-- ---------------------------------------------------------------------------
create or replace function public.record_item_use(p_item_id uuid, p_amount numeric default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_item public.food_items;
  v_after public.food_items;
  v_batch uuid := gen_random_uuid();
  v_prev_source text := current_setting('app.edit_source', true);
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  perform set_config('app.edit_source', 'consume', true);
  select * into v_item from public.food_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if v_item.status <> 'active' then
    raise exception 'This item is already marked %', v_item.status using errcode = '55000';
  end if;
  v_after := private.consume_item(v_item, 'mark_used', p_amount);
  perform private.log_item_diff(v_batch, v_item, v_after, 'user', 'mark_used', null, null, null);
  perform set_config('app.edit_source', coalesce(v_prev_source, ''), true);
  return jsonb_build_object('batch_id', v_batch, 'status', v_after.status, 'quantity', v_after.quantity);
end;
$$;

create or replace function public.record_item_waste(p_item_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_item public.food_items;
  v_after public.food_items;
  v_batch uuid := gen_random_uuid();
  v_prev_source text := current_setting('app.edit_source', true);
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  perform set_config('app.edit_source', 'consume', true);
  select * into v_item from public.food_items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if v_item.status <> 'active' then
    raise exception 'This item is already marked %', v_item.status using errcode = '55000';
  end if;
  v_after := private.consume_item(v_item, 'mark_wasted', null);
  perform private.log_item_diff(v_batch, v_item, v_after, 'user', 'mark_wasted', null, null, null);
  perform set_config('app.edit_source', coalesce(v_prev_source, ''), true);
  return jsonb_build_object('batch_id', v_batch, 'status', v_after.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- undo_ai_batch(batch_id)
-- Restores old_value only for fields whose current value still equals new_value.
-- Fields changed since are left alone and listed. Items created by the batch are removed
-- only if nothing about them changed since. Sets reverted_at on what was restored.
-- Also undoes quick used/tossed actions (source 'user', action mark_used/mark_wasted).
-- ---------------------------------------------------------------------------
create or replace function public.undo_ai_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_item_id uuid;
  v_item public.food_items;
  v_cur jsonb;
  v_revert jsonb;
  v_ids bigint[];
  v_set text;
  v_restored integer := 0;
  v_removed integer := 0;
  v_skipped jsonb := '[]';
  v_row record;
  v_all_same boolean;
  v_scan_ids uuid[];
  v_prev_source text := current_setting('app.edit_source', true);
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.ai_edit_log where batch_id = p_batch_id) then
    raise exception 'Nothing to undo for this batch' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ai_edit_log where batch_id = p_batch_id and reverted_at is not null) then
    raise exception 'This change was already undone' using errcode = '55000';
  end if;
  if exists (select 1 from public.ai_edit_log
             where batch_id = p_batch_id and source = 'user' and action not in ('mark_used', 'mark_wasted')) then
    raise exception 'Only AI changes and used/tossed actions can be undone' using errcode = '22023';
  end if;

  perform set_config('app.edit_source', 'ai', true);

  -- Items the batch created.
  for v_item_id in
    select distinct food_item_id from public.ai_edit_log
    where batch_id = p_batch_id and action = 'insert' and food_item_id is not null
  loop
    select * into v_item from public.food_items where id = v_item_id for update;
    if not found then
      continue;
    end if;
    v_cur := to_jsonb(v_item);
    select bool_and((v_cur -> l.field) is not distinct from l.new_value) into v_all_same
      from public.ai_edit_log l
      where l.batch_id = p_batch_id and l.food_item_id = v_item_id and l.field is not null;

    if v_item.status = 'active' and coalesce(v_all_same, true) then
      select array_agg(distinct scan_id) filter (where scan_id is not null) into v_scan_ids
        from public.ai_edit_log where batch_id = p_batch_id and food_item_id = v_item_id;
      update public.ai_edit_log set reverted_at = now()
        where batch_id = p_batch_id and food_item_id = v_item_id;
      delete from public.food_items where id = v_item_id;
      v_removed := v_removed + 1;
      -- A scan whose items were all removed goes back to review.
      update public.scans s set status = 'needs_review', confirmed_at = null
        where s.id = any (coalesce(v_scan_ids, '{}'))
          and s.status = 'confirmed'
          and not exists (select 1 from public.scan_items si
                          where si.scan_id = s.id and si.created_food_item_id is not null);
    else
      v_skipped := v_skipped || jsonb_build_object(
        'item_id', v_item.id, 'name', v_item.name, 'field', null, 'reason', 'changed_since');
    end if;
  end loop;

  -- Updates and used/tossed operations.
  for v_item_id in
    select distinct food_item_id from public.ai_edit_log
    where batch_id = p_batch_id and action <> 'insert' and food_item_id is not null
  loop
    select * into v_item from public.food_items where id = v_item_id for update;
    if not found then
      continue;
    end if;
    v_cur := to_jsonb(v_item);
    v_revert := '{}';
    v_ids := '{}';
    for v_row in
      select l.id, l.field, l.old_value, l.new_value
      from public.ai_edit_log l
      where l.batch_id = p_batch_id and l.food_item_id = v_item_id and l.field is not null
      order by l.id
    loop
      if (v_cur -> v_row.field) is not distinct from v_row.new_value then
        v_revert := v_revert || jsonb_build_object(v_row.field, coalesce(v_row.old_value, 'null'::jsonb));
        v_ids := array_append(v_ids, v_row.id);
      else
        v_skipped := v_skipped || jsonb_build_object(
          'item_id', v_item.id, 'name', v_item.name, 'field', v_row.field, 'reason', 'changed_since');
      end if;
    end loop;

    if v_revert <> '{}'::jsonb then
      select string_agg(format('%I = ($1).%I', k, k), ', ') into v_set from jsonb_object_keys(v_revert) as k;
      execute format('update public.food_items set %s where id = $2', v_set)
        using jsonb_populate_record(v_item, v_revert), v_item.id;
      update public.ai_edit_log set reverted_at = now() where id = any (v_ids);
      v_restored := v_restored + array_length(v_ids, 1);
    end if;
  end loop;

  perform set_config('app.edit_source', coalesce(v_prev_source, ''), true);
  return jsonb_build_object(
    'restored_fields', v_restored,
    'removed_items', v_removed,
    'skipped', v_skipped
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_ai_quota(kind, ref_id): called by the edge functions before every Gemini request.
-- 40 scans and 60 AI commands (recipes count as commands) per user per local day.
-- Every attempt is recorded in ai_usage, which users can read and insert but never change,
-- so the limits cannot be reset from the client:
--   * a scan counts once per day toward the 40, however often it is retried;
--   * one scan can be processed at most 3 times in total.
-- An advisory lock makes the check-and-insert atomic.
-- ---------------------------------------------------------------------------
create or replace function public.claim_ai_quota(p_kind text, p_ref_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_bucket text;
  v_limit integer;
  v_used integer;
  v_attempts integer;
  v_counted boolean := false;
  v_tz text;
  v_start timestamptz;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_kind = 'scan' then
    v_bucket := 'scan';
    v_limit := 40;
  elsif p_kind in ('command', 'recipe') then
    v_bucket := 'command';
    v_limit := 60;
  else
    raise exception 'Unknown quota kind "%"', p_kind using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_bucket, 0));

  v_tz := private.user_timezone(v_uid);
  v_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;

  if v_bucket = 'scan' then
    if p_ref_id is not null then
      select count(*), coalesce(bool_or(created_at >= v_start), false)
        into v_attempts, v_counted
        from public.ai_usage
        where user_id = v_uid and kind = 'scan' and ref_id = p_ref_id;
      if v_attempts >= 3 then
        return jsonb_build_object('allowed', false, 'reason', 'too_many_attempts', 'limit', 3, 'used', v_attempts);
      end if;
    end if;
    select count(distinct coalesce(ref_id::text, id::text)) into v_used
      from public.ai_usage
      where user_id = v_uid and kind = 'scan' and created_at >= v_start;
    if not v_counted and v_used >= v_limit then
      return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'limit', v_limit, 'used', v_used,
                                'resets_at', v_start + interval '1 day');
    end if;
    if not v_counted then
      v_used := v_used + 1;
    end if;
  else
    select count(*) into v_used
      from public.ai_usage
      where user_id = v_uid and kind in ('command', 'recipe') and created_at >= v_start;
    if v_used >= v_limit then
      return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'limit', v_limit, 'used', v_used,
                                'resets_at', v_start + interval '1 day');
    end if;
    v_used := v_used + 1;
  end if;

  insert into public.ai_usage (user_id, kind, ref_id) values (v_uid, p_kind, p_ref_id);

  return jsonb_build_object('allowed', true, 'limit', v_limit, 'used', v_used, 'remaining', greatest(v_limit - v_used, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: RPCs are for signed-in users only.
-- ---------------------------------------------------------------------------
revoke all on function
  private.log_item_diff(uuid, public.food_items, public.food_items, public.edit_log_source, public.edit_action, numeric, text, text),
  private.consume_item(public.food_items, text, numeric),
  private.default_expiration(text, public.food_category, public.storage_location, date)
  from public, anon;
grant execute on function
  private.log_item_diff(uuid, public.food_items, public.food_items, public.edit_log_source, public.edit_action, numeric, text, text),
  private.consume_item(public.food_items, text, numeric),
  private.default_expiration(text, public.food_category, public.storage_location, date)
  to authenticated, service_role;

revoke all on function
  public.shelf_life_lookup(jsonb),
  public.confirm_scan(uuid, jsonb),
  public.apply_ai_changes(jsonb, public.edit_log_source, text),
  public.record_item_use(uuid, numeric),
  public.record_item_waste(uuid),
  public.undo_ai_batch(uuid),
  public.claim_ai_quota(text, uuid)
  from public, anon;
grant execute on function
  public.shelf_life_lookup(jsonb),
  public.confirm_scan(uuid, jsonb),
  public.apply_ai_changes(jsonb, public.edit_log_source, text),
  public.record_item_use(uuid, numeric),
  public.record_item_waste(uuid),
  public.undo_ai_batch(uuid),
  public.claim_ai_quota(text, uuid)
  to authenticated, service_role;
