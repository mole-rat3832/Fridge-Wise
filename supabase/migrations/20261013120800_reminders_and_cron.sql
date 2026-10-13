-- Reminders and scheduled maintenance (pg_cron + pg_net -> send-reminders edge function).
--
-- One-time setup per environment (values are NOT stored in this repo):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<long random string>', 'cron_secret');
-- and set the same random string as the edge function secret CRON_SECRET.
-- Until both Vault secrets exist the jobs log a warning and do nothing.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Call an edge function from Postgres. Authenticated with a shared secret header,
-- because send-reminders uses the service role internally and must not be callable by users.
-- ---------------------------------------------------------------------------
create or replace function private.invoke_edge_function(p_name text, p_body jsonb default '{}')
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if v_url is null or v_secret is null then
    raise warning 'FridgeWise: add the project_url and cron_secret Vault secrets to enable % (see README)', p_name;
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function private.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- due_reminders(): which users get a notification right now, and for which items.
--
-- * Items are active and expire between the user's local today and today + reminder_days_before.
-- * A user is notified once their local time is 8:00 or later (the job runs hourly, so every
--   timezone gets its reminder in the morning).
-- * Each item is reminded once when it enters the window and once more on the day it expires;
--   reminder_log (unique per item, day and channel) guarantees nothing is sent twice.
-- Only the service role may call this.
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
  due as (
    select f.user_id, pr.local_date, f.id, f.name, f.expiration_date,
           (f.expiration_date - pr.local_date) as days_left
    from public.food_items f
    join prefs pr on pr.user_id = f.user_id
    where pr.local_hour >= 8
      and f.status = 'active'
      and f.expiration_date between pr.local_date and pr.local_date + pr.reminder_days_before
      and not exists (
        select 1 from public.reminder_log r
        where r.food_item_id = f.id
          and r.channel = 'push'
          and (r.sent_on = pr.local_date or f.expiration_date <> pr.local_date)
      )
  )
  select d.user_id,
         min(d.local_date) as local_date,
         jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'expiration_date', d.expiration_date,
                                      'days_left', d.days_left)
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
-- Row cleanup that needs no Storage API: old quota rows and unsaved recipe suggestions.
-- (Scan images older than 30 days are deleted by send-reminders with task=cleanup, because
-- storage objects must be deleted through the Storage API.)
-- ---------------------------------------------------------------------------
create or replace function private.cleanup_old_rows()
returns void
language sql
set search_path = ''
as $$
  delete from public.ai_usage where created_at < now() - interval '35 days';
  delete from public.recipes where not saved and made_at is null and created_at < now() - interval '14 days';
$$;

revoke all on function private.cleanup_old_rows() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedules (cron.schedule upserts by job name, so re-running this migration is safe).
-- ---------------------------------------------------------------------------
select cron.schedule(
  'fridgewise-send-reminders',
  '5 * * * *',
  $job$ select private.invoke_edge_function('send-reminders', '{"task": "reminders"}'::jsonb); $job$
);

select cron.schedule(
  'fridgewise-delete-old-scan-images',
  '17 3 * * *',
  $job$ select private.invoke_edge_function('send-reminders', '{"task": "cleanup"}'::jsonb); $job$
);

select cron.schedule(
  'fridgewise-cleanup-rows',
  '27 3 * * *',
  $job$ select private.cleanup_old_rows(); $job$
);
