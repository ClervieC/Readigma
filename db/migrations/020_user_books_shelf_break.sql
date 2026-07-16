-- Lets a user insert an empty shelf between two existing shelves (reorder
-- mode, app/(tabs)/library.tsx: the "+" divider between rows). true means
-- "an empty shelf renders immediately before this book's row" — see
-- buildRows in library.tsx. Run once in the Supabase SQL editor.

alter table user_books add column if not exists shelf_break_before boolean;
