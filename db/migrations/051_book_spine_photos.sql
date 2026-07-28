-- Lets a user photograph their own physical copy's spine (rather than the
-- catalog's front-cover art) and choose whether the shelf shows that photo
-- or the regular cover for a given book. Needs real Supabase Storage (unlike
-- profiles.avatar_url, which just stores a base64 data URI directly) since
-- spine photos are full-resolution camera shots, not small square avatars.
alter table user_books add column if not exists spine_photo_url text;
alter table user_books add column if not exists shelf_face varchar(10) not null default 'spine';
alter table user_books add constraint shelf_face_check check (shelf_face in ('spine', 'cover'));

insert into storage.buckets (id, name, public)
values ('book-spines', 'book-spines', true)
on conflict (id) do nothing;

-- Spine photos aren't sensitive (same trust level as a cover image), so the
-- bucket is public for reads; writes are restricted to the uploader's own
-- folder via the "<user_id>/..." path convention (mirrors the RLS pattern
-- already used for every user-owned table in this schema).
create policy book_spines_read on storage.objects for select
  using (bucket_id = 'book-spines');
create policy book_spines_insert on storage.objects for insert
  to authenticated with check (bucket_id = 'book-spines' and (storage.foldername(name))[1] = auth.uid()::text);
create policy book_spines_update on storage.objects for update
  to authenticated using (bucket_id = 'book-spines' and (storage.foldername(name))[1] = auth.uid()::text);
create policy book_spines_delete on storage.objects for delete
  to authenticated using (bucket_id = 'book-spines' and (storage.foldername(name))[1] = auth.uid()::text);
