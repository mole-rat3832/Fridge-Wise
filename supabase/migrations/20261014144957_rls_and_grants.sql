-- Row Level Security on every table, plus explicit grants.
-- Grants are explicit because Supabase is moving new projects to opt-in Data API exposure;
-- the anon role gets nothing: every request must come from a signed-in user.

alter table public.profiles enable row level security;
alter table public.shelf_life enable row level security;
alter table public.scans enable row level security;
alter table public.food_items enable row level security;
alter table public.scan_items enable row level security;
alter table public.ai_edit_log enable row level security;
alter table public.recipes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;
alter table public.ai_usage enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: the row id is the user id
-- ---------------------------------------------------------------------------
create policy "profiles: select own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: delete own" on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- shelf_life: read-only reference data for signed-in users
-- ---------------------------------------------------------------------------
create policy "shelf_life: readable by signed-in users" on public.shelf_life
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- User-owned tables: user_id must equal auth.uid() for select, insert, update and delete
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['scans', 'food_items', 'scan_items', 'ai_edit_log', 'recipes',
                           'push_subscriptions', 'reminder_log']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || ': select own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || ': insert own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || ': update own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || ': delete own', t);
  end loop;
end
$$;

-- ai_usage is append-only for users (see the table comment in the first migration).
create policy "ai_usage: select own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ai_usage: insert own" on public.ai_usage
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Start from nothing (Supabase's default privileges would otherwise also grant TRUNCATE etc.).
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update, delete on
  public.profiles, public.scans, public.food_items, public.scan_items, public.ai_edit_log,
  public.recipes, public.push_subscriptions, public.reminder_log
  to authenticated;
grant select on public.shelf_life to authenticated;
grant select, insert on public.ai_usage to authenticated;

grant all on all tables in schema public to service_role;
