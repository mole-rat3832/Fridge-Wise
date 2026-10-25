-- Households: shared kitchens.
--
-- A household is a kitchen that several people share. Every member sees and updates the same
-- food items; scans, photos, recipes, history exports and AI quotas stay personal.
-- food_items.household_id says which kitchen an item is in (null = the adder's own kitchen).
--
-- * Creating a household and inviting someone need a CAPTCHA. The households edge function checks
--   it and then calls create_household / invite_to_household with the service role. Those two
--   RPCs are closed to every other role, so the CAPTCHA cannot be skipped by calling them directly.
-- * Every other household action (accept, decline, revoke, leave, remove, rename, delete, list) is
--   a SECURITY DEFINER RPC that only ever acts for auth.uid() and checks membership itself.
-- * Users get no direct access to the household tables; they are reached only through the RPCs.
-- * Invites are matched to the invitee's confirmed account email, so creating one never reveals
--   whether an account exists, and an invite also works for someone who signs up later.

create type public.household_role as enum ('owner', 'member');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- At most one owner per household. When the owner goes, the longest-standing member takes over
-- (trigger below), and a household with no one left is deleted.
create unique index household_members_one_owner on public.household_members (household_id) where role = 'owner';
create index household_members_user_idx on public.household_members (user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint household_invites_once unique (household_id, email)
);

create index household_invites_email_idx on public.household_invites (email);
create index household_invites_invited_by_idx on public.household_invites (invited_by);
create index households_created_by_idx on public.households (created_by);

comment on table public.households is 'Shared kitchens. Reached only through the household RPCs.';
comment on table public.household_members is 'Who is in which household. One owner per household.';
comment on table public.household_invites is 'Pending invites, matched to the invitee''s confirmed email. Expire after 30 days.';

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

-- No policies and no grants for anon/authenticated on purpose: the RPCs are the only way in.
-- (Supabase's default privileges grant everything on new tables, so take that back explicitly.)
revoke all on public.households, public.household_members, public.household_invites from anon, authenticated;
grant all on public.households, public.household_members, public.household_invites to service_role;

create trigger households_set_updated_at
  before update on public.households
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- food_items: which kitchen an item is in
-- ---------------------------------------------------------------------------
-- Deleting a household sends its items back to the people who added them.
alter table public.food_items
  add column household_id uuid references public.households (id) on delete set null;

create index food_items_household_status_exp_idx
  on public.food_items (household_id, status, expiration_date)
  where household_id is not null;

-- ---------------------------------------------------------------------------
-- Membership helpers for RLS (SECURITY DEFINER so policies can read household_members, which
-- users cannot). They only ever answer for auth.uid().
-- ---------------------------------------------------------------------------
create or replace function private.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id from public.household_members m where m.user_id = (select auth.uid());
$$;

create or replace function private.my_owned_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id from public.household_members m
  where m.user_id = (select auth.uid()) and m.role = 'owner';
$$;

create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.household_members m
                 where m.household_id = p_household_id and m.user_id = (select auth.uid()));
$$;

-- The caller's account email, only once it is confirmed (invites are matched against it).
create or replace function private.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

revoke all on function
  private.my_household_ids(), private.my_owned_household_ids(),
  private.is_household_member(uuid), private.my_confirmed_email()
  from public, anon;
grant execute on function
  private.my_household_ids(), private.my_owned_household_ids(),
  private.is_household_member(uuid), private.my_confirmed_email()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- food_items RLS: your own kitchen, plus the kitchens of every household you are in.
-- Anyone in a household can add, edit and use up its items; only the person who added an
-- item, or the household owner, can delete it.
-- ---------------------------------------------------------------------------
drop policy "food_items: select own" on public.food_items;
drop policy "food_items: insert own" on public.food_items;
drop policy "food_items: update own" on public.food_items;
drop policy "food_items: delete own" on public.food_items;

create policy "food_items: select own kitchen and households" on public.food_items
  for select to authenticated
  using (
    (household_id is null and user_id = (select auth.uid()))
    or household_id in (select private.my_household_ids())
  );

create policy "food_items: insert into own kitchen or a household" on public.food_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (household_id is null or household_id in (select private.my_household_ids()))
  );

create policy "food_items: update own kitchen and households" on public.food_items
  for update to authenticated
  using (
    (household_id is null and user_id = (select auth.uid()))
    or household_id in (select private.my_household_ids())
  )
  with check (
    (household_id is null and user_id = (select auth.uid()))
    or household_id in (select private.my_household_ids())
  );

create policy "food_items: delete own items or as household owner" on public.food_items
  for delete to authenticated
  using (
    (user_id = (select auth.uid())
      and (household_id is null or household_id in (select private.my_household_ids())))
    or household_id in (select private.my_owned_household_ids())
  );

-- Only the person who added an item can move it into another household. (Moving a household item
-- back to a personal kitchen already requires user_id = auth.uid() through the policy above.)
create or replace function private.food_items_check_household_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id is distinct from old.household_id
     and new.household_id is not null
     and (select auth.uid()) is not null
     and old.user_id <> (select auth.uid()) then
    raise exception 'Only the person who added an item can move it to another kitchen' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger food_items_check_household_move
  before update of household_id on public.food_items
  for each row execute function private.food_items_check_household_move();

-- user_id stays locked, except when delete_my_account hands the items someone added to a
-- household over to that household's owner (so the shared list keeps them).
create or replace function private.prevent_user_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     and not (tg_table_name = 'food_items' and current_setting('app.household_handover', true) = 'on') then
    raise exception 'user_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- History: members see the history of household items, and every log row now names the person
-- who made the change (the editor), not the person who added the item.
-- ---------------------------------------------------------------------------
drop policy "ai_edit_log: select own" on public.ai_edit_log;

create policy "ai_edit_log: select own and household item history" on public.ai_edit_log
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or food_item_id in (
      select f.id from public.food_items f
      where f.household_id in (select private.my_household_ids())
    )
  );

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
      values (coalesce((select auth.uid()), p_new.user_id), p_batch_id, p_new.id, p_source, p_action, v_field,
              v_old -> v_field, v_new -> v_field, p_confidence, p_model, p_reason);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

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
      values (coalesce((select auth.uid()), new.user_id), v_batch, new.id, 'user', v_action, v_field,
              v_old -> v_field, v_new -> v_field);
    end if;
  end loop;
  return null;
end;
$$;

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
  values (coalesce((select auth.uid()), new.user_id), gen_random_uuid(), new.id, 'user', 'insert', null, v_snapshot);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership hand-over: when an owner leaves (or is deleted), the longest-standing member becomes
-- the owner; when the last member goes, the household is deleted and its items go back to the
-- people who added them. A trigger, so it also runs when an account is deleted by an admin.
-- ---------------------------------------------------------------------------
create or replace function private.household_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_heir uuid;
begin
  -- The household itself is being deleted (cascade): nothing to hand over.
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return null;
  end if;
  if exists (select 1 from public.household_members m
             where m.household_id = old.household_id and m.role = 'owner') then
    return null;
  end if;
  select m.user_id into v_heir
    from public.household_members m
    where m.household_id = old.household_id
    order by m.joined_at, m.user_id
    limit 1;
  if v_heir is null then
    delete from public.households where id = old.household_id;
  else
    update public.household_members set role = 'owner'
      where household_id = old.household_id and user_id = v_heir;
  end if;
  return null;
end;
$$;

revoke all on function private.household_members_after_delete() from public, anon, authenticated;

create trigger household_members_after_delete
  after delete on public.household_members
  for each row execute function private.household_members_after_delete();

-- ---------------------------------------------------------------------------
-- Creating households and inviting people: service role only (the households edge function
-- calls these after it has checked the user's token and a CAPTCHA). SECURITY DEFINER because they
-- read auth.users; p_user_id is the caller the edge function verified.
-- ---------------------------------------------------------------------------
create or replace function public.create_household(p_user_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Unknown user' using errcode = 'P0002';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Give the household a name of 1 to 60 characters' using errcode = '22023';
  end if;
  insert into public.households (name, created_by) values (v_name, p_user_id) returning id into v_id;
  insert into public.household_members (household_id, user_id, role) values (v_id, p_user_id, 'owner');
  return jsonb_build_object('id', v_id, 'name', v_name, 'role', 'owner');
end;
$$;

create or replace function public.invite_to_household(p_user_id uuid, p_household_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if p_user_id is null or not exists (
    select 1 from public.household_members m where m.household_id = p_household_id and m.user_id = p_user_id
  ) then
    raise exception 'Household not found' using errcode = 'P0002';
  end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  -- Members can already see each other's emails, so saying so here reveals nothing new.
  if exists (
    select 1 from public.household_members m join auth.users u on u.id = m.user_id
    where m.household_id = p_household_id and lower(u.email) = v_email
  ) then
    return jsonb_build_object('status', 'already_member', 'email', v_email);
  end if;
  insert into public.household_invites (household_id, email, invited_by)
    values (p_household_id, v_email, p_user_id)
    on conflict (household_id, email) do update
      set invited_by = excluded.invited_by, created_at = now()
    returning id into v_id;
  return jsonb_build_object('status', 'invited', 'invite_id', v_id, 'email', v_email);
end;
$$;

revoke all on function public.create_household(uuid, text), public.invite_to_household(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_household(uuid, text), public.invite_to_household(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Household RPCs for signed-in users. Each acts only for auth.uid().
-- ---------------------------------------------------------------------------

-- Households the caller is in, with their role, member count and active item count.
create or replace function public.my_households()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id,
      'name', h.name,
      'role', m.role,
      'joined_at', m.joined_at,
      'member_count', (select count(*) from public.household_members x where x.household_id = h.id),
      'item_count', (select count(*) from public.food_items f where f.household_id = h.id and f.status = 'active')
    ) order by lower(h.name), h.id), '[]'::jsonb)
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = (select auth.uid());
$$;

-- One household: its members (name, email, role) and pending invites. Members only.
create or replace function public.household_details(p_household_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.household_role;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select m.role into v_role from public.household_members m
    where m.household_id = p_household_id and m.user_id = v_uid;
  if v_role is null then
    raise exception 'Household not found' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
      'id', h.id,
      'name', h.name,
      'role', v_role,
      'created_at', h.created_at,
      'members', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', m.user_id,
            'display_name', p.display_name,
            'email', u.email,
            'role', m.role,
            'joined_at', m.joined_at,
            'is_you', m.user_id = v_uid
          ) order by (m.role = 'owner') desc, m.joined_at, m.user_id), '[]'::jsonb)
        from public.household_members m
        join auth.users u on u.id = m.user_id
        left join public.profiles p on p.id = m.user_id
        where m.household_id = h.id
      ),
      'invites', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', i.id,
            'email', i.email,
            'created_at', i.created_at,
            'invited_by_name', coalesce(nullif(btrim(ip.display_name), ''), iu.email)
          ) order by i.created_at desc), '[]'::jsonb)
        from public.household_invites i
        left join public.profiles ip on ip.id = i.invited_by
        left join auth.users iu on iu.id = i.invited_by
        where i.household_id = h.id and i.created_at > now() - interval '30 days'
      )
    ) into v_result
  from public.households h
  where h.id = p_household_id;
  return v_result;
end;
$$;

-- Invites waiting for the caller (matched to their confirmed email), newest first.
create or replace function public.my_household_invites()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'household_id', h.id,
      'household_name', h.name,
      'invited_by_name', nullif(btrim(ip.display_name), ''),
      'invited_by_email', iu.email,
      'member_count', (select count(*) from public.household_members x where x.household_id = h.id),
      'created_at', i.created_at
    ) order by i.created_at desc), '[]'::jsonb)
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.profiles ip on ip.id = i.invited_by
  left join auth.users iu on iu.id = i.invited_by
  where i.email = private.my_confirmed_email()
    and i.created_at > now() - interval '30 days'
    and not exists (select 1 from public.household_members m
                    where m.household_id = i.household_id and m.user_id = (select auth.uid()));
$$;

create or replace function public.respond_to_household_invite(p_invite_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.household_invites;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select * into v_invite from public.household_invites i
    where i.id = p_invite_id
      and i.email = private.my_confirmed_email()
      and i.created_at > now() - interval '30 days'
    for update;
  if not found then
    raise exception 'This invite is no longer available' using errcode = 'P0002';
  end if;
  if coalesce(p_accept, false) then
    insert into public.household_members (household_id, user_id, role)
      values (v_invite.household_id, v_uid, 'member')
      on conflict (household_id, user_id) do nothing;
  end if;
  delete from public.household_invites where id = v_invite.id;
  return jsonb_build_object('household_id', v_invite.household_id, 'joined', coalesce(p_accept, false));
end;
$$;

-- Any member can take back a pending invite.
create or replace function public.revoke_household_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from public.household_invites i
    where i.id = p_invite_id and private.is_household_member(i.household_id);
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Leave a household. Items you added stay in it for the others.
create or replace function public.leave_household(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  delete from public.household_members where household_id = p_household_id and user_id = v_uid;
  if not found then
    raise exception 'Household not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('household_deleted', not exists (select 1 from public.households where id = p_household_id));
end;
$$;

-- The owner removes someone. Items they added stay in the household.
create or replace function public.remove_household_member(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.household_members m
                 where m.household_id = p_household_id and m.user_id = v_uid and m.role = 'owner') then
    raise exception 'Only the household owner can remove people' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'To leave the household yourself, use Leave' using errcode = '22023';
  end if;
  delete from public.household_members where household_id = p_household_id and user_id = p_user_id;
  if not found then
    raise exception 'That person is not in this household' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.rename_household(p_household_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not coalesce(p_household_id in (select private.my_owned_household_ids()), false) then
    raise exception 'Only the household owner can rename it' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Give the household a name of 1 to 60 characters' using errcode = '22023';
  end if;
  update public.households set name = v_name where id = p_household_id;
end;
$$;

-- The owner deletes the household. Its items go back to the people who added them.
create or replace function public.delete_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not coalesce(p_household_id in (select private.my_owned_household_ids()), false) then
    raise exception 'Only the household owner can delete it' using errcode = '42501';
  end if;
  delete from public.households where id = p_household_id;
end;
$$;

revoke all on function
  public.my_households(), public.household_details(uuid), public.my_household_invites(),
  public.respond_to_household_invite(uuid, boolean), public.revoke_household_invite(uuid),
  public.leave_household(uuid), public.remove_household_member(uuid, uuid),
  public.rename_household(uuid, text), public.delete_household(uuid)
  from public, anon;
grant execute on function
  public.my_households(), public.household_details(uuid), public.my_household_invites(),
  public.respond_to_household_invite(uuid, boolean), public.revoke_household_invite(uuid),
  public.leave_household(uuid), public.remove_household_member(uuid, uuid),
  public.rename_household(uuid, text), public.delete_household(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- confirm_scan: scanned items can go into a household's kitchen (p_household_id).
-- Everything else is unchanged from the AI RPCs migration.
-- ---------------------------------------------------------------------------
drop function public.confirm_scan(uuid, jsonb);

create function public.confirm_scan(p_scan_id uuid, p_items jsonb, p_household_id uuid default null)
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
  if p_household_id is not null and not private.is_household_member(p_household_id) then
    raise exception 'You are not in that household' using errcode = '42501';
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
      user_id, household_id, name, brand, category, storage_location, quantity, unit, purchase_date,
      expiration_date, expiration_source, opened_at, price_cents, barcode, notes,
      image_path, scan_item_id, ai_confidence, user_locked_fields
    ) values (
      v_uid, p_household_id, btrim(v_row.name), nullif(btrim(v_row.brand), ''),
      coalesce(v_row.category, 'other'), coalesce(v_row.storage_location, 'fridge'),
      coalesce(v_row.quantity, 1), coalesce(v_row.unit, 'count'), coalesce(v_row.purchase_date, v_today),
      v_row.expiration_date, case when v_row.expiration_date is null then null else v_row.expiration_source end,
      v_row.opened_at, v_row.price_cents, nullif(v_row.barcode, ''), nullif(btrim(v_row.notes), ''),
      -- The photo stays private to the person who scanned it, so household items don't point at it.
      case when p_household_id is null then v_scan.image_path end,
      v_si.id, v_si.confidence, v_locked
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
-- apply_ai_changes: "create" operations add the item to p_household_id (null = own kitchen).
-- Updates and used/tossed work on any item the caller can see (own kitchen and households).
-- Everything else is unchanged from the AI RPCs migration.
-- ---------------------------------------------------------------------------
drop function public.apply_ai_changes(jsonb, public.edit_log_source, text);

create function public.apply_ai_changes(
  p_batch jsonb,
  p_source public.edit_log_source,
  p_model text default null,
  p_household_id uuid default null
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
  if p_household_id is not null and not private.is_household_member(p_household_id) then
    raise exception 'You are not in that household' using errcode = '42501';
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
        user_id, household_id, name, brand, category, storage_location, quantity, unit, purchase_date,
        expiration_date, expiration_source, opened_at, price_cents, barcode, notes
      ) values (
        v_uid, p_household_id, btrim(v_new.name), nullif(btrim(v_new.brand), ''),
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

    -- RLS limits this to items the caller can see (own kitchen and households).
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

revoke all on function
  public.confirm_scan(uuid, jsonb, uuid),
  public.apply_ai_changes(jsonb, public.edit_log_source, text, uuid)
  from public, anon;
grant execute on function
  public.confirm_scan(uuid, jsonb, uuid),
  public.apply_ai_changes(jsonb, public.edit_log_source, text, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- undo_ai_batch: members can see each other's history on household items, so make sure people
-- only undo their own changes. Everything else is unchanged from the undo migration.
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
  if exists (select 1 from public.ai_edit_log where batch_id = p_batch_id and user_id <> auth.uid()) then
    raise exception 'You can only undo your own changes' using errcode = '42501';
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
-- Reminders: everyone in a household is reminded about its items (once per person, item, day
-- and channel), next to the items in their own kitchen. Household items carry the kitchen name.
-- ---------------------------------------------------------------------------
create or replace function public.due_reminders()
returns table (
  user_id uuid,
  local_date date,
  items jsonb,
  subscriptions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with prefs as (
    select p.id as user_id,
           p.reminder_days_before,
           (now() at time zone p.timezone)::date as local_date,
           extract(hour from now() at time zone p.timezone) as local_hour
    from public.profiles p
    where p.notify_push
  ),
  kitchens as (
    -- Every item each person should hear about: their own kitchen plus their households.
    select pr.user_id, f.id as food_item_id
    from prefs pr
    join public.food_items f on f.user_id = pr.user_id and f.household_id is null
    union
    select pr.user_id, f.id
    from prefs pr
    join public.household_members m on m.user_id = pr.user_id
    join public.food_items f on f.household_id = m.household_id
  ),
  due as (
    select pr.user_id, pr.local_date, f.id, f.name, f.expiration_date,
           (f.expiration_date - pr.local_date) as days_left,
           h.name as kitchen
    from kitchens k
    join prefs pr on pr.user_id = k.user_id
    join public.food_items f on f.id = k.food_item_id
    left join public.households h on h.id = f.household_id
    where pr.local_hour >= 8
      and f.status = 'active'
      and f.expiration_date between pr.local_date and pr.local_date + pr.reminder_days_before
      and not exists (
        select 1 from public.reminder_log r
        where r.user_id = pr.user_id
          and r.food_item_id = f.id
          and r.channel = 'push'
          and (r.sent_on = pr.local_date or f.expiration_date <> pr.local_date)
      )
  )
  select d.user_id,
         min(d.local_date) as local_date,
         jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'expiration_date', d.expiration_date,
                                      'days_left', d.days_left, 'kitchen', d.kitchen)
                   order by d.expiration_date, d.name) as items,
         (select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
            from public.push_subscriptions s where s.user_id = d.user_id) as subscriptions
  from due d
  where exists (select 1 from public.push_subscriptions s where s.user_id = d.user_id)
  group by d.user_id;
$$;

revoke all on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- Stats per kitchen: rows for your own kitchen (household_id null, user_id = you) and one set of
-- rows per household you are in (household_id set, user_id null, everyone's items together).
-- Days are counted in the viewer's timezone.
-- ---------------------------------------------------------------------------
drop view public.user_stats;

create view public.user_stats
with (security_invoker = true)
as
with events as (
  select
    case when f.household_id is null then f.user_id end as user_id,
    f.household_id,
    f.status,
    coalesce(f.price_cents, 0) as price_cents,
    (case when f.status = 'used' then coalesce(f.consumed_at, f.updated_at)
          else coalesce(f.wasted_at, f.updated_at) end
      at time zone private.user_timezone((select auth.uid())))::date as local_day
  from public.food_items f
  where f.status in ('used', 'wasted')
)
select
  user_id,
  household_id,
  'week'::text as period,
  date_trunc('week', local_day)::date as week_start,
  count(*) filter (where status = 'used')::int as items_used,
  count(*) filter (where status = 'wasted')::int as items_wasted,
  coalesce(sum(price_cents) filter (where status = 'used'), 0)::bigint as money_saved_cents,
  coalesce(sum(price_cents) filter (where status = 'wasted'), 0)::bigint as money_wasted_cents
from events
group by user_id, household_id, date_trunc('week', local_day)
union all
select
  user_id,
  household_id,
  'all_time'::text as period,
  null::date as week_start,
  count(*) filter (where status = 'used')::int,
  count(*) filter (where status = 'wasted')::int,
  coalesce(sum(price_cents) filter (where status = 'used'), 0)::bigint,
  coalesce(sum(price_cents) filter (where status = 'wasted'), 0)::bigint
from events
group by user_id, household_id;

comment on view public.user_stats is
  'Used vs. wasted items and money per kitchen (own kitchen: user_id set; household: household_id set), weekly and all-time.';

revoke all on public.user_stats from anon, authenticated;
grant select on public.user_stats to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- delete_my_account: leave every household first (ownership passes on through the trigger), then
-- hand the items you added to households over to each household's owner so the shared lists keep
-- them. Everything else of yours is deleted with the account as before.
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

  delete from public.household_members where user_id = v_uid;

  perform set_config('app.household_handover', 'on', true);
  update public.food_items f
    set user_id = o.user_id, image_path = null
    from public.household_members o
    where f.user_id = v_uid and f.household_id = o.household_id and o.role = 'owner';
  perform set_config('app.household_handover', '', true);

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Daily cleanup also drops invites older than 30 days (they stop working at 30 days anyway).
-- ---------------------------------------------------------------------------
create or replace function private.cleanup_old_rows()
returns void
language sql
set search_path = ''
as $$
  delete from public.ai_usage where created_at < now() - interval '35 days';
  delete from public.recipes where not saved and made_at is null and created_at < now() - interval '14 days';
  delete from public.household_invites where created_at < now() - interval '30 days';
$$;

revoke all on function private.cleanup_old_rows() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live updates: the app listens for changes to the open kitchen's items (Supabase Realtime
-- applies the same RLS, so people only hear about rows they can see).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'food_items') then
    alter publication supabase_realtime add table public.food_items;
  end if;
end
$$;
