-- Daily row cleanup (split out of reminders_and_cron).

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

select cron.schedule(
  'fridgewise-cleanup-rows',
  '27 3 * * *',
  $job$ select private.cleanup_old_rows(); $job$
);
