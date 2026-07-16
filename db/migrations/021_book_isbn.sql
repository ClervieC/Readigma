-- Adds an ISBN field to books and book_suggestions, so a suggested book can
-- carry its ISBN through to the catalog entry an admin approves (see
-- BookFormFields in components/BookForm.tsx). Run once in the Supabase SQL
-- editor.

alter table books add column if not exists isbn varchar(20);
alter table book_suggestions add column if not exists isbn varchar(20);
