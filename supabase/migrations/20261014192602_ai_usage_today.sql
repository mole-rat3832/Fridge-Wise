-- ai_usage_today(): how much of today's AI quota the caller has used, counted exactly like
-- claim_ai_quota (scans: distinct scans; requests: commands + recipe calls), plus when the
-- limits reset: the next midnight in the user's timezone. Read-only; RLS keeps it to the caller.
create or replace function public.ai_usage_today()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with b as (
    select tz,
           (date_trunc('day', now() at time zone tz)) at time zone tz as day_start,
           (date_trunc('day', now() at time zone tz) + interval '1 day') at time zone tz as resets_at
    from (select private.user_timezone(auth.uid()) as tz) t
  )
  select jsonb_build_object(
    'scans_used', (select count(distinct coalesce(u.ref_id::text, u.id::text))
                     from public.ai_usage u, b
                    where u.user_id = auth.uid() and u.kind = 'scan' and u.created_at >= b.day_start),
    'scans_limit', 40,
    'requests_used', (select count(*)
                        from public.ai_usage u, b
                       where u.user_id = auth.uid() and u.kind in ('command', 'recipe') and u.created_at >= b.day_start),
    'requests_limit', 60,
    'resets_at', (select resets_at from b),
    'timezone', (select tz from b)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.ai_usage_today() from public, anon;
grant execute on function public.ai_usage_today() to authenticated, service_role;
