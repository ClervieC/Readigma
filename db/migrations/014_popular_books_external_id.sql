-- popular_books() returned book_id (our internal uuid) but not external_id.
-- app/(tabs)/search.tsx renders popular results through the same BookItem/
-- addBook path as search results, and addBook() always calls
-- books.addBookToDb(), which upserts on external_id — with no external_id at
-- all, that upsert tried to insert a *new* row with a null external_id,
-- violating its not-null constraint (400 Bad Request). Popular books already
-- exist in `books`; they just need external_id along for the ride so the
-- upsert recognizes them as the same row. Run once in the Supabase SQL editor.

drop function if exists popular_books();

create function popular_books()
returns table (
  book_id uuid, external_id varchar, title varchar, author varchar, cover_url text, description text,
  genres text[], published_year int, add_count bigint
)
language sql security definer set search_path = public stable as $$
  select b.id, b.external_id, b.title, b.author, b.cover_url, b.description, b.genres, b.published_year, count(ub.id)
  from books b
  join user_books ub on ub.book_id = b.id
  where b.approved = true
  group by b.id
  order by count(ub.id) desc
  limit 10;
$$;
