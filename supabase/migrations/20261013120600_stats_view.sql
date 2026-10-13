-- user_stats: items used vs. wasted and money saved vs. wasted, per week (in the user's
-- timezone, weeks start Monday) and all-time.
-- security_invoker = true means the view runs with the caller's permissions, so RLS on
-- food_items and profiles limits every user to their own numbers.

create or replace view public.user_stats
with (security_invoker = true)
as
with events as (
  select
    f.user_id,
    f.status,
    coalesce(f.price_cents, 0) as price_cents,
    (case when f.status = 'used' then coalesce(f.consumed_at, f.updated_at)
          else coalesce(f.wasted_at, f.updated_at) end
      at time zone coalesce(p.timezone, 'UTC'))::date as local_day
  from public.food_items f
  left join public.profiles p on p.id = f.user_id
  where f.status in ('used', 'wasted')
)
select
  user_id,
  'week'::text as period,
  date_trunc('week', local_day)::date as week_start,
  count(*) filter (where status = 'used')::int as items_used,
  count(*) filter (where status = 'wasted')::int as items_wasted,
  coalesce(sum(price_cents) filter (where status = 'used'), 0)::bigint as money_saved_cents,
  coalesce(sum(price_cents) filter (where status = 'wasted'), 0)::bigint as money_wasted_cents
from events
group by user_id, date_trunc('week', local_day)
union all
select
  user_id,
  'all_time'::text as period,
  null::date as week_start,
  count(*) filter (where status = 'used')::int,
  count(*) filter (where status = 'wasted')::int,
  coalesce(sum(price_cents) filter (where status = 'used'), 0)::bigint,
  coalesce(sum(price_cents) filter (where status = 'wasted'), 0)::bigint
from events
group by user_id;

comment on view public.user_stats is
  'Used vs. wasted items and money (price of used = saved, price of wasted = wasted), weekly and all-time.';

revoke all on public.user_stats from anon, authenticated;
grant select on public.user_stats to authenticated, service_role;
