-- pgTAP tests for FridgeWise. Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(125);

-- ---------------------------------------------------------------------------
-- Fixtures: two users (profiles are created by the auth trigger)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'alice@example.com', '', '{"display_name":"Alice","timezone":"America/New_York"}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'bob@example.com', '', '{"timezone":"Not/AZone"}', now(), now());

select is((select timezone from profiles where id = '11111111-1111-4111-8111-111111111111'),
          'America/New_York', 'profile created with timezone from sign-up metadata');
select is((select timezone from profiles where id = '22222222-2222-4222-8222-222222222222'),
          'UTC', 'invalid sign-up timezone falls back to UTC');

create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- A demo account: app_metadata.demo = true in the token (set by an admin, never by the user).
create or replace function pg_temp.login_demo(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'app_metadata', json_build_object('demo', true))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- RLS isolation
-- ---------------------------------------------------------------------------
select pg_temp.login('11111111-1111-4111-8111-111111111111');

insert into food_items (id, name, category, storage_location, quantity, unit, purchase_date, expiration_date, expiration_source, price_cents)
values ('aaaaaaaa-0000-4000-8000-000000000001', '2% Milk', 'dairy', 'fridge', 1, 'gal', current_date, current_date + 7, 'printed_date', 389),
       ('aaaaaaaa-0000-4000-8000-000000000002', 'Chicken Breast', 'meat', 'fridge', 2, 'lb', current_date, current_date + 2, 'shelf_life_table', 899),
       ('aaaaaaaa-0000-4000-8000-000000000003', 'Cheddar Cheese', 'dairy', 'fridge', 8, 'oz', current_date, current_date + 60, 'shelf_life_table', 479);

select is((select count(*)::int from food_items), 3, 'Alice sees her 3 items');
select is((select user_id from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          '11111111-1111-4111-8111-111111111111'::uuid, 'user_id defaults to auth.uid()');
select is((select count(*)::int from ai_edit_log where action = 'insert' and source = 'user'), 3,
          'manual inserts are logged as user history');

select throws_ok(
  $$ insert into food_items (user_id, name) values ('22222222-2222-4222-8222-222222222222', 'Sneaky') $$,
  '42501', null, 'cannot insert rows for another user');

select pg_temp.login('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from food_items), 0, 'Bob cannot see Alice''s items');
select is((select count(*)::int from ai_edit_log), 0, 'Bob cannot see Alice''s history');
update food_items set name = 'Hacked' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select is((select name from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'), '2% Milk',
          'Bob''s update did not touch Alice''s row');

select throws_ok(
  $$ update food_items set user_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '42501', null, 'user_id cannot be changed');

-- Check constraints
select throws_ok(
  $$ update food_items set quantity = -1 where id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'quantity must be >= 0');
select throws_ok(
  $$ insert into food_items (name, purchase_date, expiration_date) values ('Forever Cheese', current_date, current_date + 1200) $$,
  '23514', null, 'expiration_date cannot be more than 3 years after purchase_date');

-- ---------------------------------------------------------------------------
-- Field ownership: user edits lock fields
-- ---------------------------------------------------------------------------
update food_items set expiration_date = current_date + 5 where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select ok((select 'expiration_date' = any (user_locked_fields) from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          'user edit locks expiration_date');
select is((select expiration_source::text from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'user',
          'user-typed date gets expiration_source = user');
select is((select count(*)::int from ai_edit_log where food_item_id = 'aaaaaaaa-0000-4000-8000-000000000001' and source = 'user' and action = 'update' and field = 'expiration_date'),
          1, 'user edit is written to history');

-- ---------------------------------------------------------------------------
-- apply_ai_changes
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select apply_ai_changes('{"operations":[{"op":"update","item_id":"aaaaaaaa-0000-4000-8000-000000000001","changes":{"status":"used"}}]}', 'ai_command', 'test') $$,
  '42501', null, 'status is not an AI-writable field');
select throws_ok(
  $$ select apply_ai_changes('{"operations":[{"op":"update","item_id":"aaaaaaaa-0000-4000-8000-000000000001","changes":{"user_locked_fields":[]}}]}', 'ai_command', 'test') $$,
  '42501', null, 'user_locked_fields is not AI-writable');
select throws_ok(
  $$ select apply_ai_changes('{"operations":[{"op":"delete","item_id":"aaaaaaaa-0000-4000-8000-000000000001"}]}', 'ai_command', 'test') $$,
  '22023', null, 'there is no delete operation');
select throws_ok(
  $$ select apply_ai_changes('{"operations":[{"op":"mark_used","item_id":"aaaaaaaa-0000-4000-8000-000000000001"}]}', 'user', 'test') $$,
  '22023', null, 'apply_ai_changes refuses the user source');

create temp table r1 as
  select apply_ai_changes(
    '{"operations":[{"op":"update","item_id":"aaaaaaaa-0000-4000-8000-000000000001","changes":{"expiration_date":"2030-01-01","quantity":0.5},"reason":"You used half","confidence":0.9}]}',
    'ai_command', 'gemini-test') as res;
grant select on r1 to authenticated;

select is((select quantity from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0.5::numeric,
          'AI changed the unlocked quantity');
select is((select expiration_date from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'), current_date + 5,
          'AI did not overwrite the locked expiration_date');
select is((select res -> 'skipped' -> 0 ->> 'field' from r1), 'expiration_date', 'locked field is reported as skipped');
select is((select count(*)::int from ai_edit_log where batch_id = (select (res ->> 'batch_id')::uuid from r1)), 1,
          'one log row per changed field');
select is((select old_value from ai_edit_log where batch_id = (select (res ->> 'batch_id')::uuid from r1)), '1.000'::jsonb,
          'log keeps the old value');
select ok(not (select 'quantity' = any (user_locked_fields) from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          'AI edits do not lock fields');

-- Moving to the freezer recalculates the expiration date from shelf_life (chicken: 270 days frozen)
create temp table r2 as
  select apply_ai_changes(
    '[{"op":"update","item_id":"aaaaaaaa-0000-4000-8000-000000000002","changes":{"storage_location":"freezer"},"reason":"Moved to the freezer"}]',
    'ai_command', 'gemini-test') as res;
grant select on r2 to authenticated;
select is((select expiration_date from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
          (now() at time zone 'America/New_York')::date + 270, 'freezer move recalculates expiration (user timezone)');
select is((select expiration_source::text from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000002'), 'shelf_life_table',
          'recalculated date is tagged shelf_life_table');
select is((select array_agg(field order by field) from ai_edit_log where batch_id = (select (res ->> 'batch_id')::uuid from r2)),
          array['expiration_date', 'storage_location'], 'freezer batch logs storage_location and the recalculated expiration_date');

-- Opening cheese shortens the date to days_opened (28)
update food_items set opened_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000003';
select is((select expiration_date from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
          (now() at time zone 'America/New_York')::date + 28, 'opening recalculates expiration from days_opened');

-- Partial use, then use the rest
create temp table r3 as
  select apply_ai_changes('[{"op":"mark_used","item_id":"aaaaaaaa-0000-4000-8000-000000000003","amount":3}]', 'ai_command', 'gemini-test') as res;
select is((select quantity from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000003'), 5::numeric, 'partial use lowers quantity');
select is((select status::text from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000003'), 'active', 'partial use keeps item active');
select apply_ai_changes('[{"op":"mark_used","item_id":"aaaaaaaa-0000-4000-8000-000000000003","amount":5}]', 'ai_command', 'gemini-test');
select is((select status::text from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000003'), 'used', 'quantity 0 marks the item used');
select ok((select consumed_at is not null from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000003'), 'consumed_at is set');
select is((select res -> 'skipped' -> 0 ->> 'reason'
           from (select apply_ai_changes('[{"op":"update","item_id":"aaaaaaaa-0000-4000-8000-000000000003","changes":{"notes":"x"}}]', 'ai_command', 'gemini-test') as res) s),
          'not_active', 'used items are skipped');

-- create
create temp table r4 as
  select apply_ai_changes('[{"op":"create","item":{"name":"Baby Spinach","category":"produce","storage_location":"fridge","quantity":1,"unit":"pack"}}]', 'ai_command', 'gemini-test') as res;
grant select on r4 to authenticated;
select is((select expiration_source::text from food_items where id = (select (res -> 'applied' -> 0 ->> 'item_id')::uuid from r4)),
          'shelf_life_table', 'create fills expiration from shelf_life');

-- ---------------------------------------------------------------------------
-- undo_ai_batch
-- ---------------------------------------------------------------------------
-- User edits the expiration that the freezer move set; undo must restore only the location.
update food_items set expiration_date = current_date + 100 where id = 'aaaaaaaa-0000-4000-8000-000000000002';
create temp table u2 as select undo_ai_batch((select (res ->> 'batch_id')::uuid from r2)) as res;
select is((select storage_location::text from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000002'), 'fridge',
          'undo restores fields that were not changed since');
select is((select expiration_date from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000002'), current_date + 100,
          'undo leaves fields the user changed since');
select ok((select (res -> 'skipped')::text like '%expiration_date%' from u2), 'undo lists the fields it left alone');
select throws_ok(
  $$ select undo_ai_batch((select (res ->> 'batch_id')::uuid from r2)) $$,
  '55000', null, 'a batch can only be undone once');

-- Undo of a create removes the untouched item
select undo_ai_batch((select (res ->> 'batch_id')::uuid from r4));
select is((select count(*)::int from food_items where name = 'Baby Spinach'), 0, 'undoing a create removes the unchanged item');

-- Undo of quick "used"
create temp table q1 as select record_item_use('aaaaaaaa-0000-4000-8000-000000000001') as res;
grant select on q1 to authenticated;
select is((select status::text from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'used', 'quick used marks item used');
select undo_ai_batch((select (res ->> 'batch_id')::uuid from q1));
select is((select status::text || ':' || quantity::text from food_items where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
          'active:0.500', 'undo of quick used restores status and quantity');

-- ---------------------------------------------------------------------------
-- confirm_scan
-- ---------------------------------------------------------------------------
insert into scans (id, type, image_path, status, store_name, purchase_date, model)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'receipt',
        '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000001.jpg',
        'needs_review', 'Walmart', current_date, 'gemini-test');
insert into scan_items (id, scan_id, position, raw_text, name, category, storage_location, quantity, unit, price_cents,
                        estimated_expiration_date, expiration_source, field_confidence, confidence, is_food)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 0, 'GV 2% MLK GAL', '2% Milk', 'dairy', 'fridge', 1, 'gal', 389,
        current_date + 7, 'shelf_life_table', '{"name":0.95,"quantity":0.9,"price_cents":0.99,"expiration_date":0.6}', 0.6, true),
       ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 1, 'BAG FEE', 'Bag Fee', 'other', 'pantry', 1, 'count', 10,
        null, null, '{}', 0.9, false);

select is((select include from scan_items where id = 'cccccccc-0000-4000-8000-000000000002'), false, 'non-food lines start unchecked');

create temp table c1 as
  select confirm_scan('bbbbbbbb-0000-4000-8000-000000000001',
    '[{"scan_item_id":"cccccccc-0000-4000-8000-000000000001","include":true,"name":"2% Milk","quantity":2},
      {"scan_item_id":"cccccccc-0000-4000-8000-000000000002","include":false}]') as res;
grant select on c1 to authenticated;

select is((select (res ->> 'created_count')::int from c1), 1, 'confirm_scan creates only included items');
select is((select count(*)::int from food_items where name = '2% Milk' and status = 'active'), 2,
          'same name creates a separate batch instead of overwriting');
select is((select user_locked_fields from food_items where scan_item_id = 'cccccccc-0000-4000-8000-000000000001'), array['quantity'],
          'fields changed during review are locked');
select is((select count(*)::int from ai_edit_log where batch_id = (select (res ->> 'batch_id')::uuid from c1) and source = 'ai_scan'), 8,
          'one ai_scan insert entry per AI-filled field');
select is((select confidence from ai_edit_log where batch_id = (select (res ->> 'batch_id')::uuid from c1) and field = 'expiration_date'), 0.6,
          'log keeps the field confidence');
select is((select status::text from scans where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 'confirmed', 'scan is confirmed');
select isnt((select created_food_item_id from scan_items where id = 'cccccccc-0000-4000-8000-000000000001'), null,
          'scan item is linked to the created food item');

-- ---------------------------------------------------------------------------
-- Quota, demo data, stats
-- ---------------------------------------------------------------------------
select pg_temp.logout();
insert into ai_usage (user_id, kind) select '11111111-1111-4111-8111-111111111111', 'scan' from generate_series(1, 40);
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select is((select (claim_ai_quota('scan') ->> 'allowed')::boolean), false, 'the 41st scan of the day is refused');
select is((select (claim_ai_quota('command') ->> 'allowed')::boolean), true, 'commands have their own quota');
select is((select claim_ai_quota('scan', 'dddddddd-0000-4000-8000-000000000001') ->> 'reason'), 'daily_limit', 'a new scan is refused at the daily limit');
select pg_temp.logout();
delete from ai_usage where user_id = '11111111-1111-4111-8111-111111111111';
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select is((select (claim_ai_quota('scan', 'dddddddd-0000-4000-8000-000000000002') ->> 'used')::int), 1, 'first attempt counts one scan');
select is((select (claim_ai_quota('scan', 'dddddddd-0000-4000-8000-000000000002') ->> 'used')::int), 1, 'retrying the same scan does not count again');
select is((select (claim_ai_quota('scan', 'dddddddd-0000-4000-8000-000000000002') ->> 'allowed')::boolean), true, 'third attempt is allowed');
select is((select claim_ai_quota('scan', 'dddddddd-0000-4000-8000-000000000002') ->> 'reason'), 'too_many_attempts', 'a fourth attempt on one scan is refused');
select is((select (ai_usage_today() ->> 'scans_used')::int), 1, 'ai_usage_today counts a retried scan once');
select is((select (ai_usage_today() ->> 'requests_used')::int), 0, 'ai_usage_today counts AI requests separately from scans');
select ok((select (u ->> 'timezone') = 'America/New_York'
              and (u ->> 'resets_at')::timestamptz > now()
              and (u ->> 'resets_at')::timestamptz <= now() + interval '1 day'
              and ((u ->> 'resets_at')::timestamptz at time zone 'America/New_York')::time = '00:00'
           from (select ai_usage_today() as u) x),
          'the limits reset at the next midnight in the user''s timezone');
select pg_temp.login('22222222-2222-4222-8222-222222222222');
select is((select (ai_usage_today() ->> 'scans_used')::int), 0, 'ai_usage_today only counts the caller''s own usage');
select pg_temp.logout();
select set_config('role', 'anon', true);
select throws_ok($$ select ai_usage_today() $$, '42501', null, 'signed-out visitors cannot read usage');
select pg_temp.logout();
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select throws_ok($$ update ai_usage set created_at = now() - interval '2 days' $$, '42501', null, 'users cannot rewrite quota rows');
select throws_ok($$ delete from ai_usage $$, '42501', null, 'users cannot delete quota rows');

select throws_ok($$ select load_demo_data() $$, '42501', null, 'regular accounts cannot load demo data');
select throws_ok($$ select clear_demo_data() $$, '42501', null, 'regular accounts cannot clear demo data');
select pg_temp.login_demo('11111111-1111-4111-8111-111111111111');
select is((select (load_demo_data() ->> 'active_items')::int), 23, 'demo accounts load 23 active items');
select ok((select items_used > 0 and money_saved_cents > 0 from user_stats where period = 'all_time'), 'user_stats has all-time totals');

-- ---------------------------------------------------------------------------
-- Households (shared kitchens)
-- ---------------------------------------------------------------------------
select pg_temp.logout();
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'carol@example.com', '', '{"display_name":"Carol"}', now(), now(), now());
update auth.users set email_confirmed_at = now()
  where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
create temp table hh (k text primary key, id uuid);
grant select, insert, update on hh to authenticated, service_role;

select pg_temp.login('11111111-1111-4111-8111-111111111111');
select throws_ok($$ select * from households $$, '42501', null, 'users cannot read the households table directly');
select throws_ok($$ insert into household_members (household_id, user_id) values (gen_random_uuid(), auth.uid()) $$,
                 '42501', null, 'users cannot add themselves to a household');
select throws_ok($$ select create_household('11111111-1111-4111-8111-111111111111', 'Sneaky') $$,
                 '42501', null, 'users cannot create a household without the CAPTCHA-checked edge function');
select throws_ok($$ select invite_to_household('11111111-1111-4111-8111-111111111111', gen_random_uuid(), 'x@example.com') $$,
                 '42501', null, 'users cannot invite without the CAPTCHA-checked edge function');

-- The households edge function runs these as the service role after checking the CAPTCHA.
select pg_temp.logout();
select set_config('role', 'service_role', true);
insert into hh select 'maple', (create_household('11111111-1111-4111-8111-111111111111', '  Maple Street  ') ->> 'id')::uuid;
insert into hh select 'carol', (create_household('33333333-3333-4333-8333-333333333333', 'Carol''s Place') ->> 'id')::uuid;
select is((select invite_to_household('11111111-1111-4111-8111-111111111111', (select id from hh where k = 'maple'), ' Bob@Example.com ') ->> 'status'),
          'invited', 'a member can invite by email (stored lowercased)');
select is((select invite_to_household('11111111-1111-4111-8111-111111111111', (select id from hh where k = 'maple'), 'alice@example.com') ->> 'status'),
          'already_member', 'inviting someone who is already in the household says so');
select throws_ok($$ select invite_to_household('33333333-3333-4333-8333-333333333333', (select id from hh where k = 'maple'), 'x@example.com') $$,
                 'P0002', null, 'people outside a household cannot invite to it');
select throws_ok($$ select invite_to_household('11111111-1111-4111-8111-111111111111', (select id from hh where k = 'maple'), 'not-an-email') $$,
                 '22023', null, 'invites need a valid email address');
select throws_ok($$ select create_household('11111111-1111-4111-8111-111111111111', '   ') $$,
                 '22023', null, 'households need a name');
select pg_temp.logout();
select is((select name from households where id = (select id from hh where k = 'maple')), 'Maple Street', 'household names are trimmed');
select is((select role::text from household_members where household_id = (select id from hh where k = 'maple')
             and user_id = '11111111-1111-4111-8111-111111111111'), 'owner', 'the creator owns the household');

-- Invites
select pg_temp.login('33333333-3333-4333-8333-333333333333');
select is(jsonb_array_length(my_household_invites()), 0, 'invites are only shown to the invited email');
select throws_ok($$ select household_details((select id from hh where k = 'maple')) $$, 'P0002', null,
                 'people outside a household cannot see its members');
select throws_ok($$ select respond_to_household_invite((select id from household_invites limit 1), true) $$, '42501', null,
                 'the invites table stays closed');
select pg_temp.login('22222222-2222-4222-8222-222222222222');
select is((select my_household_invites() -> 0 ->> 'household_name'), 'Maple Street', 'Bob sees his invite');
select is((select my_household_invites() -> 0 ->> 'invited_by_name'), 'Alice', 'the invite says who sent it');
insert into hh select 'bob_invite', (my_household_invites() -> 0 ->> 'id')::uuid;
select pg_temp.login('33333333-3333-4333-8333-333333333333');
select throws_ok($$ select respond_to_household_invite((select id from hh where k = 'bob_invite'), true) $$, 'P0002', null,
                 'nobody can accept an invite meant for someone else');
select pg_temp.login('22222222-2222-4222-8222-222222222222');
select is((select respond_to_household_invite((select id from hh where k = 'bob_invite'), true) ->> 'joined')::boolean, true,
          'Bob accepts the invite');
select is((select my_households() -> 0 ->> 'role'), 'member', 'Bob is a member');
select is(jsonb_array_length(household_details((select id from hh where k = 'maple')) -> 'members'), 2,
          'members see everyone in the household');
select is(jsonb_array_length(my_household_invites()), 0, 'an accepted invite is gone');

-- Shared items
select pg_temp.login('11111111-1111-4111-8111-111111111111');
insert into food_items (id, household_id, name, category, quantity, unit, price_cents, expiration_date)
values ('eeeeeeee-0000-4000-8000-000000000001', (select id from hh where k = 'maple'), 'Shared Milk', 'dairy', 1, 'gal', 400, current_date + 5);
select pg_temp.login('22222222-2222-4222-8222-222222222222');
select is((select name from food_items where household_id = (select id from hh where k = 'maple')), 'Shared Milk',
          'Bob sees what Alice added to the household');
select is((select count(*)::int from food_items where household_id is null), 0, 'Bob still cannot see Alice''s own kitchen');
insert into hh select 'bob_use', (record_item_use('eeeeeeee-0000-4000-8000-000000000001', 0.5) ->> 'batch_id')::uuid;
select is((select quantity from food_items where id = 'eeeeeeee-0000-4000-8000-000000000001'), 0.5::numeric(12, 3),
          'Bob can use up part of a household item');
select is((select distinct user_id from ai_edit_log where batch_id = (select id from hh where k = 'bob_use')),
          '22222222-2222-4222-8222-222222222222'::uuid, 'history names the person who made the change');
delete from food_items where id = 'eeeeeeee-0000-4000-8000-000000000001';
select is((select count(*)::int from food_items where id = 'eeeeeeee-0000-4000-8000-000000000001'), 1,
          'members cannot delete items someone else added');
select throws_ok($$ update food_items set household_id = null where id = 'eeeeeeee-0000-4000-8000-000000000001' $$,
                 '42501', null, 'members cannot take someone else''s item into their own kitchen');
select throws_ok($$ insert into food_items (household_id, name) values ((select id from hh where k = 'carol'), 'Sneaky') $$,
                 '42501', null, 'nobody can add items to a household they are not in');
insert into food_items (id, household_id, name) values ('eeeeeeee-0000-4000-8000-000000000002', (select id from hh where k = 'maple'), 'Bob''s Bread');
insert into food_items (id, name) values ('eeeeeeee-0000-4000-8000-000000000003', 'Bob''s Jam');
update food_items set household_id = (select id from hh where k = 'maple') where id = 'eeeeeeee-0000-4000-8000-000000000003';
select is((select household_id from food_items where id = 'eeeeeeee-0000-4000-8000-000000000003'), (select id from hh where k = 'maple'),
          'people can move their own items into a household');

select pg_temp.login('11111111-1111-4111-8111-111111111111');
select ok((select count(*) > 0 from ai_edit_log where food_item_id = 'eeeeeeee-0000-4000-8000-000000000001'
             and user_id = '22222222-2222-4222-8222-222222222222'), 'members see each other''s history on household items');
select throws_ok($$ select undo_ai_batch((select id from hh where k = 'bob_use')) $$, '42501', null,
                 'people can only undo their own changes');
delete from food_items where id = 'eeeeeeee-0000-4000-8000-000000000002';
select is((select count(*)::int from food_items where id = 'eeeeeeee-0000-4000-8000-000000000002'), 0,
          'the owner can delete any item in the household');
select pg_temp.logout();
insert into households (id, name) values ('eeeeeeee-0000-4000-8000-0000000000f1', 'Cabin');
insert into household_members (household_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-0000000000f1', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('eeeeeeee-0000-4000-8000-0000000000f1', '22222222-2222-4222-8222-222222222222', 'member');
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select throws_ok($$ update food_items set household_id = 'eeeeeeee-0000-4000-8000-0000000000f1' where id = 'eeeeeeee-0000-4000-8000-000000000003' $$,
                 '42501', null, 'only the person who added an item can move it to another household');
select lives_ok($$ select record_item_waste('eeeeeeee-0000-4000-8000-000000000001') $$, 'any member can mark a household item tossed');
select is((select items_wasted from user_stats where household_id = (select id from hh where k = 'maple') and period = 'all_time'), 1,
          'stats are kept per household');
select ok((select count(*) = 1 from user_stats where household_id is null and period = 'all_time'),
          'own-kitchen stats stay separate from household stats');

-- Reminders reach every member (the timezone is picked so it is past 8:00 there right now).
select pg_temp.logout();
update profiles set notify_push = true,
       timezone = case when extract(hour from now() at time zone 'UTC') >= 8 then 'UTC' else 'Asia/Tokyo' end
  where id in ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('22222222-2222-4222-8222-222222222222', 'https://push.example.com/bob', 'key', 'auth'),
  ('33333333-3333-4333-8333-333333333333', 'https://push.example.com/carol', 'key', 'auth');
insert into food_items (id, user_id, household_id, name, expiration_date)
values ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', (select id from hh where k = 'maple'), 'Shared Yogurt',
        (now() at time zone (select timezone from profiles where id = '22222222-2222-4222-8222-222222222222'))::date + 1);
select is((select items -> 0 ->> 'kitchen' from due_reminders() where user_id = '22222222-2222-4222-8222-222222222222'), 'Maple Street',
          'household members are reminded about household items');
select is((select count(*)::int from due_reminders() where user_id = '33333333-3333-4333-8333-333333333333'), 0,
          'people outside the household are not reminded about its items');
select pg_temp.login('11111111-1111-4111-8111-111111111111');

select pg_temp.login('33333333-3333-4333-8333-333333333333');
select is((select count(*)::int from food_items where household_id = (select id from hh where k = 'maple')), 0,
          'people outside a household cannot see its items');
select is((select count(*)::int from ai_edit_log where food_item_id = 'eeeeeeee-0000-4000-8000-000000000001'), 0,
          'people outside a household cannot see its history');

-- Managing the household
select pg_temp.login('22222222-2222-4222-8222-222222222222');
select throws_ok($$ select remove_household_member((select id from hh where k = 'maple'), '11111111-1111-4111-8111-111111111111') $$,
                 '42501', null, 'only the owner can remove people');
select throws_ok($$ select rename_household((select id from hh where k = 'maple'), 'Mine now') $$, '42501', null,
                 'only the owner can rename the household');
select throws_ok($$ select delete_household((select id from hh where k = 'maple')) $$, '42501', null,
                 'only the owner can delete the household');
select pg_temp.logout();
select set_config('role', 'service_role', true);
insert into hh select 'dave_invite', (invite_to_household('22222222-2222-4222-8222-222222222222', (select id from hh where k = 'maple'), 'dave@example.com') ->> 'invite_id')::uuid;
select pg_temp.login('33333333-3333-4333-8333-333333333333');
select throws_ok($$ select revoke_household_invite((select id from hh where k = 'dave_invite')) $$, 'P0002', null,
                 'people outside a household cannot revoke its invites');
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select lives_ok($$ select revoke_household_invite((select id from hh where k = 'dave_invite')) $$, 'any member can revoke a pending invite');
select is(jsonb_array_length(household_details((select id from hh where k = 'maple')) -> 'invites'), 0, 'the revoked invite is gone');
select lives_ok($$ select rename_household((select id from hh where k = 'maple'), 'Maple St.') $$, 'the owner can rename the household');
select lives_ok($$ select leave_household('eeeeeeee-0000-4000-8000-0000000000f1') $$, 'the owner can leave');
select pg_temp.logout();
select is((select role::text from household_members where household_id = 'eeeeeeee-0000-4000-8000-0000000000f1'
             and user_id = '22222222-2222-4222-8222-222222222222'), 'owner', 'when the owner leaves, the next member takes over');
select pg_temp.login('22222222-2222-4222-8222-222222222222');
select is((select (leave_household('eeeeeeee-0000-4000-8000-0000000000f1') ->> 'household_deleted')::boolean), true,
          'a household is deleted when its last member leaves');

-- Deleting an account keeps the shared list intact
select pg_temp.login('11111111-1111-4111-8111-111111111111');
select lives_ok($$ select delete_my_account() $$, 'an owner can delete their account');
select pg_temp.logout();
select is((select role::text from household_members where household_id = (select id from hh where k = 'maple')
             and user_id = '22222222-2222-4222-8222-222222222222'), 'owner', 'ownership passes on when the owner deletes their account');
select is((select user_id from food_items where id = 'eeeeeeee-0000-4000-8000-000000000001'),
          '22222222-2222-4222-8222-222222222222'::uuid, 'items the deleted account added stay in the household');
select is((select count(*)::int from food_items where user_id = '11111111-1111-4111-8111-111111111111'), 0,
          'everything else of the deleted account is gone');
select pg_temp.login('22222222-2222-4222-8222-222222222222');
select lives_ok($$ select delete_household((select id from hh where k = 'maple')) $$, 'the owner can delete the household');
select is((select household_id from food_items where id = 'eeeeeeee-0000-4000-8000-000000000003'), null,
          'items go back to the people who added them when a household is deleted');
select pg_temp.logout();
select set_config('role', 'anon', true);
select throws_ok($$ select my_households() $$, '42501', null, 'signed-out visitors cannot list households');
select pg_temp.logout();

select * from finish();
rollback;
