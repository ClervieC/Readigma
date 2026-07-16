-- Lets a proposed book edit (app/edit-book-suggestion.tsx) also fill in a
-- missing ISBN — useful on its own, and it's what lib/books.ts's cover/
-- description/genre lookups (findBookInfoByIsbn) key off once approved. Run
-- once in the Supabase SQL editor.

alter table book_edit_suggestions add column if not exists isbn varchar(20);
