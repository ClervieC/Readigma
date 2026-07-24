-- Distinguishes "I already have this book" from "it's on my wishlist" for
-- to_read entries — a separate axis from `status` (which tracks reading
-- progress, not possession). Defaults true so every existing row and every
-- future add-to-library call keeps today's behavior; only an explicit
-- wishlist toggle sets it false. RLS is row-level (user_books_owner), so no
-- policy change is needed for this column.
alter table user_books add column if not exists owned boolean not null default true;
