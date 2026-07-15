-- app/suggest-book.tsx now mirrors admin.tsx's "Ajouter un livre" form
-- exactly, so a suggestion arrives with everything needed to add it to the
-- catalog directly (admin just reviews and confirms), not just title/author
-- + a free-text message. Run once in the Supabase SQL editor.

alter table book_suggestions add column if not exists cover_url text;
alter table book_suggestions add column if not exists description text;
alter table book_suggestions add column if not exists genres text[] not null default '{}';
alter table book_suggestions add column if not exists published_year int;
alter table book_suggestions add column if not exists series varchar(500);
alter table book_suggestions add column if not exists series_index numeric(5,2);
