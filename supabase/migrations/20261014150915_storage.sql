-- Private bucket for scan photos. Files live at {user_id}/{scan_id}.jpg.
-- Images are compressed in the browser (max 1600px, JPEG), so 5 MB is plenty.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Each user can only touch files inside their own folder, named like a scan id.
create policy "scans bucket: read own folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "scans bucket: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );

create policy "scans bucket: update own folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  );

create policy "scans bucket: delete own folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'scans'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
