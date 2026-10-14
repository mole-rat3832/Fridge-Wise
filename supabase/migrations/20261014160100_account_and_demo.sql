-- Account deletion and demo data.
--
-- Demo data is only for demo accounts. An admin marks one in the user's app_metadata, which
-- users cannot change themselves (SQL editor):
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"demo": true}' where email = '...';
-- The flag reaches the app in the access token at the next sign-in. Regular accounts never see
-- the demo controls, and load_demo_data / clear_demo_data refuse them.

-- ---------------------------------------------------------------------------
-- delete_my_account(): removes the caller's auth user. Every user-owned table references
-- auth.users with ON DELETE CASCADE, so all rows go with it. The app deletes the user's
-- scan images through the Storage API first (Supabase does not allow deleting storage
-- objects with SQL). SECURITY DEFINER is required to delete from auth.users; the function
-- only ever deletes the row for auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- True when the caller's token says this is a demo account (app_metadata.demo = true).
create or replace function private.is_demo_account()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'demo', '') = 'true';
$$;

revoke all on function private.is_demo_account() from public, anon;
grant execute on function private.is_demo_account() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- load_demo_data(): about 20 active items with mixed expiration dates (relative to the
-- user's "today"), plus a few weeks of used/wasted history so Stats has something to show.
-- Re-running replaces the previous demo rows.
-- ---------------------------------------------------------------------------
create or replace function public.load_demo_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_tz text;
  v_active integer;
  v_history integer;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not private.is_demo_account() then
    raise exception 'Demo data is only available on demo accounts' using errcode = '42501';
  end if;
  v_today := private.user_today(v_uid);
  v_tz := private.user_timezone(v_uid);

  delete from public.food_items where user_id = v_uid and is_demo;

  -- name, brand, category, location, quantity, unit, price, purchased (days ago),
  -- expires (days from today), opened (days ago or null), source of the date
  insert into public.food_items (
    user_id, name, brand, category, storage_location, quantity, unit, price_cents,
    purchase_date, expiration_date, expiration_source, opened_at, is_demo, notes
  )
  select v_uid, d.name, d.brand, d.category::public.food_category, d.loc::public.storage_location,
         d.qty, d.unit::public.unit, d.price, v_today - d.bought, v_today + d.expires,
         d.src::public.field_source,
         case when d.opened is null then null
              else ((v_today - d.opened)::timestamp + interval '19 hours') at time zone v_tz end,
         true, 'Demo item'
  from (values
    ('2% Milk',          'Great Value',   'dairy',      'fridge',  1.0,  'gal',    389,  6,   0,   3,    'printed_date'),
    ('2% Milk',          'Great Value',   'dairy',      'fridge',  1.0,  'gal',    389,  1,   9,   null, 'printed_date'),
    ('Baby Spinach',     'Organic Girl',  'produce',    'fridge',  1.0,  'pack',   349,  6,  -1,   2,    'shelf_life_table'),
    ('Leftover Chili',   null,            'leftovers',  'fridge',  1.0,  'count',  null, 4,   0,   null, 'shelf_life_table'),
    ('Chicken Breast',   null,            'meat',       'fridge',  1.5,  'lb',     899,  1,   1,   null, 'shelf_life_table'),
    ('Strawberries',     'Driscoll''s',   'produce',    'fridge',  1.0,  'lb',     399,  3,   1,   null, 'shelf_life_table'),
    ('Greek Yogurt',     'Fage',          'dairy',      'fridge',  4.0,  'count',  549,  8,   2,   null, 'printed_date'),
    ('Bananas',          null,            'produce',    'pantry',  5.0,  'count',  149,  3,   2,   null, 'shelf_life_table'),
    ('Sourdough Bread',  'Local Bakery',  'bakery',     'pantry',  1.0,  'count',  599,  2,   3,   2,    'shelf_life_table'),
    ('Broccoli',         null,            'produce',    'fridge',  1.0,  'count',  229,  2,   3,   null, 'shelf_life_table'),
    ('Avocados',         null,            'produce',    'fridge',  2.0,  'count',  300,  2,   4,   null, 'shelf_life_table'),
    ('Fresh Mozzarella', 'BelGioioso',    'dairy',      'fridge',  8.0,  'oz',     399,  3,   5,   null, 'printed_date'),
    ('Orange Juice',     'Tropicana',     'beverages',  'fridge', 52.0,  'fl_oz',  429,  2,   6,   1,    'shelf_life_table'),
    ('Carrots',          null,            'produce',    'fridge',  2.0,  'lb',     249,  5,  14,   null, 'shelf_life_table'),
    ('Large Eggs',       'Vital Farms',   'eggs',       'fridge', 12.0,  'count',  629,  7,  18,   null, 'printed_date'),
    ('Large Eggs',       'Vital Farms',   'eggs',       'fridge', 12.0,  'count',  629,  1,  27,   null, 'printed_date'),
    ('Cheddar Cheese',   'Tillamook',     'dairy',      'fridge',  8.0,  'oz',     479, 10,  25,   4,    'shelf_life_table'),
    ('Apples',           'Honeycrisp',    'produce',    'fridge',  6.0,  'count',  499,  4,  30,   null, 'shelf_life_table'),
    ('Butter',           'Kerrygold',     'dairy',      'fridge',  8.0,  'oz',     499, 12,  45,   5,    'printed_date'),
    ('Ground Beef',      null,            'meat',       'freezer', 1.0,  'lb',     649,  9, 111,   null, 'shelf_life_table'),
    ('Frozen Peas',      'Birds Eye',     'frozen',     'freezer', 1.0,  'pack',   199, 20, 220,   null, 'printed_date'),
    ('Marinara Sauce',   'Rao''s',        'condiments', 'pantry', 24.0,  'oz',     899, 15, 300,   null, 'printed_date'),
    ('Spaghetti',        'Barilla',       'pantry',     'pantry',  1.0,  'lb',     189, 30, 540,   null, 'printed_date')
  ) as d(name, brand, category, loc, qty, unit, price, bought, expires, opened, src);
  get diagnostics v_active = row_count;

  -- History for Stats: (name, category, location, unit, price, days ago, status)
  insert into public.food_items (
    user_id, name, category, storage_location, quantity, unit, price_cents, purchase_date,
    expiration_date, expiration_source, status, consumed_at, wasted_at, is_demo, notes
  )
  select v_uid, h.name, h.category::public.food_category, h.loc::public.storage_location,
         case when h.status = 'used' then 0 else 1 end, h.unit::public.unit, h.price,
         v_today - h.ago - 7, v_today - h.ago + 1, 'shelf_life_table',
         h.status::public.item_status,
         case when h.status = 'used' then ((v_today - h.ago)::timestamp + interval '18 hours') at time zone v_tz end,
         case when h.status = 'wasted' then ((v_today - h.ago)::timestamp + interval '18 hours') at time zone v_tz end,
         true, 'Demo history'
  from (values
    ('Whole Milk',       'dairy',     'fridge', 'gal',   399, 40, 'used'),
    ('Romaine Lettuce',  'produce',   'fridge', 'count', 279, 36, 'wasted'),
    ('Wheat Bread',      'bakery',    'pantry', 'count', 349, 34, 'used'),
    ('Large Eggs',       'eggs',      'fridge', 'count', 429, 30, 'used'),
    ('Chicken Thighs',   'meat',      'fridge', 'lb',    749, 27, 'used'),
    ('Raspberries',      'produce',   'fridge', 'pack',  449, 24, 'wasted'),
    ('Greek Yogurt',     'dairy',     'fridge', 'count', 549, 21, 'used'),
    ('Apples',           'produce',   'fridge', 'count', 499, 19, 'used'),
    ('Cilantro',         'produce',   'fridge', 'count', 129, 15, 'wasted'),
    ('Baby Spinach',     'produce',   'fridge', 'pack',  349, 13, 'used'),
    ('Cheddar Cheese',   'dairy',     'fridge', 'oz',    479, 11, 'used'),
    ('Leftover Soup',    'leftovers', 'fridge', 'count', 0,   9,  'wasted'),
    ('Penne Pasta',      'pantry',    'pantry', 'lb',    189, 8,  'used'),
    ('Salmon Fillet',    'seafood',   'fridge', 'lb',    1299, 5, 'used'),
    ('Bananas',          'produce',   'pantry', 'count', 149, 4,  'used'),
    ('Bagels',           'bakery',    'pantry', 'pack',  399, 2,  'wasted')
  ) as h(name, category, loc, unit, price, ago, status);
  get diagnostics v_history = row_count;

  return jsonb_build_object('active_items', v_active, 'history_items', v_history);
end;
$$;

create or replace function public.clear_demo_data()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not private.is_demo_account() then
    raise exception 'Demo data is only available on demo accounts' using errcode = '42501';
  end if;
  delete from public.food_items where user_id = auth.uid() and is_demo;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.load_demo_data(), public.clear_demo_data() from public, anon;
grant execute on function public.load_demo_data(), public.clear_demo_data() to authenticated;
