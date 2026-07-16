-- Library screen's shelf/grid toggle (app/(tabs)/library.tsx) used to reset
-- to 'shelf' on every app load since it only lived in React state — this
-- persists the choice on the profile row so it sticks across sessions/
-- devices instead of the user having to re-pick it every time. Run once in
-- the Supabase SQL editor.

alter table profiles add column if not exists library_view_mode varchar(10) not null default 'shelf';
