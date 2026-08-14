-- books_update_any (schema.sql) previously let any authenticated user
-- update ANY column of ANY row in the shared catalog — title, author,
-- cover_url, description, genres, isbn, approved, everything — with no
-- admin check. That's a real vandalism vector and defeats the whole
-- suggest-then-admin-approves flow (lib/bookEdits.ts, app/admin.tsx).
--
-- The one legitimate non-admin write is app/book/[id].tsx's "set series/
-- tome" field (lib/books.ts's updateBookSeries), reachable by any signed-in
-- reader. RLS policies are row-level, not column-level, so that narrow case
-- is carved out as its own security-definer RPC (bypasses the row policy
-- entirely, but only ever touches series/series_index) instead of leaving
-- the whole table open.
drop policy if exists books_update_any on books;

create policy books_update_admin on books for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create or replace function update_book_series(p_book_id uuid, p_series text, p_series_index numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update books set series = p_series, series_index = p_series_index where id = p_book_id;
end;
$$;

grant execute on function update_book_series(uuid, text, numeric) to authenticated;
