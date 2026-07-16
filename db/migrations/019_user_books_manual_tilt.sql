-- Spine tilt on the shelf (app/(tabs)/library.tsx) used to be 100%
-- automatic (hashed from the book id) with no way to change it. This lets a
-- user override it per book: -1 = tilt left, 0 = stand straight, 1 = tilt
-- right, null = keep the automatic angle. Run once in the Supabase SQL
-- editor.

alter table user_books add column if not exists manual_tilt smallint;
