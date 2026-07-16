-- Lets a user manually pile a few books flat together on the shelf (reorder
-- mode, app/(tabs)/library.tsx) instead of only ever seeing the automatic,
-- pseudo-random pile grouping. Books sharing the same pile_id (within the
-- same user + status) render as one lying-down stack, ordered among
-- themselves by shelf_position; null means "not manually piled" — see
-- buildRows in library.tsx for the fallback to the automatic grouping when
-- no book in a status has been manually piled yet. Run once in the Supabase
-- SQL editor.

alter table user_books add column if not exists pile_id text;
