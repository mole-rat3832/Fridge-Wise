-- FridgeWise core schema: enums and tables.
-- Every user-owned table carries user_id (default auth.uid()) and is protected by RLS in a later migration.

create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live in a schema that the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.food_category as enum (
  'produce', 'dairy', 'meat', 'seafood', 'eggs', 'bakery', 'frozen',
  'pantry', 'beverages', 'condiments', 'leftovers', 'other'
);

create type public.storage_location as enum ('fridge', 'freezer', 'pantry');

create type public.item_status as enum ('active', 'used', 'wasted');

create type public.field_source as enum (
  'user', 'ai_scan', 'ai_estimate', 'ai_command', 'shelf_life_table', 'printed_date'
);

create type public.scan_type as enum ('receipt', 'product');

create type public.scan_status as enum (
  'uploaded', 'processing', 'needs_review', 'confirmed', 'failed', 'discarded'
);

create type public.unit as enum (
  'count', 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'gal', 'pack'
);

-- Added: which kind of date was printed on a package.
create type public.printed_date_type as enum (
  'best_by', 'use_by', 'sell_by', 'expires', 'freeze_by', 'other'
);

-- ai_edit_log.source. 'user' is an addition so the item history can show the
-- user's own edits next to AI edits on one timeline.
create type public.edit_log_source as enum ('ai_scan', 'ai_command', 'ai_recipe', 'user');

create type public.edit_action as enum ('insert', 'update', 'mark_used', 'mark_wasted');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  household_size smallint not null default 1 check (household_size between 1 and 20),
  reminder_days_before smallint not null default 2 check (reminder_days_before between 0 and 14),
  notify_push boolean not null default false,
  notify_email boolean not null default false,
  timezone text not null default 'UTC',
  -- Added: BCP-47 locale used to read ambiguous printed dates such as 03/04.
  locale text not null default 'en-US' check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  -- Added: set when onboarding is finished so the app knows where to send the user.
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. Created automatically on sign up.';

-- ---------------------------------------------------------------------------
-- shelf_life (reference data, seeded from USDA FoodKeeper guidance)
-- ---------------------------------------------------------------------------
create table public.shelf_life (
  id bigint generated always as identity primary key,
  -- Lowercase keyword; "|" separates alternatives (e.g. 'strawberry|strawberries').
  -- NULL keyword = category-wide default for that storage location.
  keyword text check (keyword is null or keyword ~ '^[a-z0-9]+( [a-z0-9]+)*(\|[a-z0-9]+( [a-z0-9]+)*)*$'),
  category public.food_category not null,
  storage_location public.storage_location not null,
  days_unopened integer not null check (days_unopened between 1 and 1095),
  days_opened integer check (days_opened is null or days_opened between 1 and 1095),
  source text not null default 'USDA FoodKeeper',
  constraint shelf_life_unique unique nulls not distinct (keyword, category, storage_location)
);

comment on table public.shelf_life is
  'Storage times in days. Values follow USDA FoodKeeper guidance (midpoint or conservative end of each range).';

-- ---------------------------------------------------------------------------
-- scans
-- ---------------------------------------------------------------------------
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type public.scan_type not null,
  image_path text,
  status public.scan_status not null default 'uploaded',
  store_name text check (store_name is null or char_length(store_name) <= 120),
  purchase_date date,
  model text,
  raw_response jsonb,
  error text,
  -- Added: number of processing attempts, capped by scan-image to protect the Gemini quota.
  attempts smallint not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  confirmed_at timestamptz,
  constraint scans_id_user_unique unique (id, user_id),
  constraint scans_image_path_owner check (image_path is null or image_path like user_id::text || '/%')
);

-- ---------------------------------------------------------------------------
-- food_items
-- ---------------------------------------------------------------------------
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text check (brand is null or char_length(brand) <= 80),
  category public.food_category not null default 'other',
  storage_location public.storage_location not null default 'fridge',
  quantity numeric(12, 3) not null default 1 check (quantity >= 0),
  unit public.unit not null default 'count',
  purchase_date date default current_date,
  expiration_date date,
  expiration_source public.field_source,
  opened_at timestamptz,
  status public.item_status not null default 'active',
  price_cents integer check (price_cents is null or price_cents between 0 and 10000000),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  notes text check (notes is null or char_length(notes) <= 1000),
  image_path text,
  scan_item_id uuid,
  ai_confidence numeric(4, 3) check (ai_confidence is null or ai_confidence between 0 and 1),
  user_locked_fields text[] not null default '{}',
  consumed_at timestamptz,
  wasted_at timestamptz,
  -- Added: marks rows created by "Load demo data" so they can be removed again.
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_items_id_user_unique unique (id, user_id),
  constraint food_items_expiration_window check (
    expiration_date is null or purchase_date is null
    or expiration_date <= (purchase_date + interval '3 years')::date
  ),
  constraint food_items_locked_fields_valid check (
    user_locked_fields <@ array[
      'name', 'brand', 'category', 'storage_location', 'quantity', 'unit', 'price_cents',
      'barcode', 'purchase_date', 'expiration_date', 'expiration_source', 'opened_at', 'notes'
    ]::text[]
  )
);

-- ---------------------------------------------------------------------------
-- scan_items (staging rows the user reviews before anything reaches food_items)
-- ---------------------------------------------------------------------------
create table public.scan_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Added: original order on the receipt.
  position smallint not null default 0,
  raw_text text check (raw_text is null or char_length(raw_text) <= 500),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text check (brand is null or char_length(brand) <= 80),
  category public.food_category not null default 'other',
  storage_location public.storage_location not null default 'fridge',
  quantity numeric(12, 3) not null default 1 check (quantity >= 0),
  unit public.unit not null default 'count',
  -- Receipts can contain discount lines, so negative prices are allowed here (never in food_items).
  price_cents integer check (price_cents is null or price_cents between -10000000 and 10000000),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  printed_date date,
  printed_date_type public.printed_date_type,
  estimated_expiration_date date,
  expiration_source public.field_source,
  -- Added: storage instructions printed on a product label, e.g. "Refrigerate after opening".
  storage_instructions text check (storage_instructions is null or char_length(storage_instructions) <= 300),
  notes text check (notes is null or char_length(notes) <= 1000),
  -- Per-field confidence keyed by food_items column names, e.g. {"name": 0.94, "quantity": 0.6}.
  field_confidence jsonb not null default '{}' check (jsonb_typeof(field_confidence) = 'object'),
  -- Added: overall confidence for the line (minimum of the key fields).
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  is_food boolean not null default true,
  -- Defaults to is_food via trigger (a column default cannot reference another column).
  include boolean not null,
  created_food_item_id uuid,
  created_at timestamptz not null default now(),
  constraint scan_items_scan_fk foreign key (scan_id, user_id)
    references public.scans (id, user_id) on delete cascade
);

alter table public.food_items
  add constraint food_items_scan_item_fk foreign key (scan_item_id)
    references public.scan_items (id) on delete set null;

alter table public.scan_items
  add constraint scan_items_created_food_item_fk foreign key (created_food_item_id)
    references public.food_items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- ai_edit_log (one row per changed field; a batch_id groups one logical change)
-- ---------------------------------------------------------------------------
create table public.ai_edit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  batch_id uuid not null,
  food_item_id uuid references public.food_items (id) on delete set null,
  scan_id uuid references public.scans (id) on delete set null,
  source public.edit_log_source not null,
  action public.edit_action not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  model text,
  -- Added: the AI's short explanation ("You said you used half the milk").
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  reverted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  ingredients jsonb not null default '[]' check (jsonb_typeof(ingredients) = 'array'),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  uses_item_ids uuid[] not null default '{}',
  saved boolean not null default false,
  -- Added: total time and servings returned by the model.
  time_minutes smallint check (time_minutes is null or time_minutes between 1 and 1440),
  servings smallint check (servings is null or servings between 1 and 50),
  model text,
  -- Added: when the user last tapped "I made this".
  made_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reminder_log (unique so the same reminder is never sent twice)
-- ---------------------------------------------------------------------------
create table public.reminder_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  food_item_id uuid not null references public.food_items (id) on delete cascade,
  sent_on date not null,
  channel text not null check (channel in ('push', 'email')),
  created_at timestamptz not null default now(),
  constraint reminder_log_once unique (user_id, food_item_id, sent_on, channel)
);

-- ---------------------------------------------------------------------------
-- ai_usage (added): append-only counter for the daily Gemini quota.
-- Users can read and insert their rows but never update or delete them,
-- so deleting a scan does not give back quota.
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('scan', 'command', 'recipe')),
  ref_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (every foreign key is indexed; plus the hot dashboard queries)
-- ---------------------------------------------------------------------------
create index food_items_user_status_exp_idx on public.food_items (user_id, status, expiration_date);
create index food_items_scan_item_idx on public.food_items (scan_item_id);
create index scans_user_created_idx on public.scans (user_id, created_at desc);
create index scans_cleanup_idx on public.scans (created_at) where image_path is not null;
create index scan_items_scan_idx on public.scan_items (scan_id, user_id, position);
create index scan_items_user_idx on public.scan_items (user_id);
create index scan_items_created_food_item_idx on public.scan_items (created_food_item_id);
create index ai_edit_log_item_idx on public.ai_edit_log (food_item_id, created_at desc);
create index ai_edit_log_user_idx on public.ai_edit_log (user_id, created_at desc);
create index ai_edit_log_batch_idx on public.ai_edit_log (batch_id);
create index ai_edit_log_scan_idx on public.ai_edit_log (scan_id);
create index recipes_user_idx on public.recipes (user_id, created_at desc);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index reminder_log_item_idx on public.reminder_log (food_item_id, channel, sent_on);
create index ai_usage_user_kind_idx on public.ai_usage (user_id, kind, created_at desc);
create index shelf_life_lookup_idx on public.shelf_life (storage_location, category);
