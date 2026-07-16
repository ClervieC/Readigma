-- Lets a user drag/tap-reorder books on their shelf (app/(tabs)/library.tsx
-- reorder mode) instead of only ever seeing them sorted by date added.
-- Null means "not manually placed yet" — those fall back to created_at
-- ordering; once a user reorders anything in a status, that whole list gets
-- sequential positions (see lib/userBooks.ts saveShelfOrder). Run once in
-- the Supabase SQL editor.

alter table user_books add column if not exists shelf_position integer;
