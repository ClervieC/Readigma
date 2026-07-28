-- get_shared_reading_messages declares `id` (and `user_id`) as OUT columns
-- in its RETURNS TABLE signature, which PL/pgSQL treats as in-scope
-- variables for the whole function body — the bare `where id = p_reading_id`
-- and `where user_id = auth.uid()` lookups against shared_readings/
-- user_books could then mean either that variable or the table's own
-- column of the same name ("column reference \"id\" is ambiguous", 42702).
-- Every other get_shared_reading_* function already qualifies every column
-- it touches; this one just missed it on these two lookups.
create or replace function get_shared_reading_messages(p_reading_id uuid)
returns table(id uuid, user_id uuid, username varchar, avatar_url text, content text, percent_threshold numeric, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_book_id uuid;
  v_my_percent numeric;
begin
  select shared_readings.book_id into v_book_id from shared_readings where shared_readings.id = p_reading_id;
  select coalesce(user_books.progress_percent, 0) into v_my_percent
    from user_books where user_books.user_id = auth.uid() and user_books.book_id = v_book_id;
  v_my_percent := coalesce(v_my_percent, 0);

  return query
    select m.id, m.user_id, p.username, p.avatar_url, m.content, m.percent_threshold, m.created_at
    from shared_reading_messages m
    join profiles p on p.id = m.user_id
    where m.shared_reading_id = p_reading_id
      and m.percent_threshold <= v_my_percent
    order by m.percent_threshold asc, m.created_at asc;
end;
$$;
