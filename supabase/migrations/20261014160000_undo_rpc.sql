-- undo_ai_batch lives in its own migration (it was split out of ai_rpcs).
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

revoke all on function public.undo_ai_batch(uuid) from public, anon;
grant execute on function public.undo_ai_batch(uuid) to authenticated, service_role;
