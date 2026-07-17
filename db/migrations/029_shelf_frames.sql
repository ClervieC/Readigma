-- A decorative photo frame a user can drop into their shelf, alongside their
-- books — shows either one of their book covers or a picture from their own
-- gallery. Lives in its own table (not user_books) since it isn't a book:
-- no status/progress/rating, just a position in that status's shelf order
-- and image content. `position` shares the same ordering space as
-- user_books.shelf_position for that status, so a frame can be interleaved
-- between books when the shelf is built.

create table shelf_frames (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  status        varchar(20) not null,           -- 'to_read' | 'reading' | 'done' | 'dnf'
  position      int not null default 0,
  -- Exactly one of these is set: a chosen book's cover, or a picture the
  -- user picked from their own device gallery (stored inline as a data URI,
  -- same approach as profiles.avatar_url — no storage bucket set up yet).
  book_id       uuid references books(id) on delete set null,
  image_url     text,
  created_at    timestamptz not null default now()
);

alter table shelf_frames enable row level security;

create policy shelf_frames_owner on shelf_frames for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
