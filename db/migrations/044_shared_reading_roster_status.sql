-- Adds each member's reading status (to_read/reading/done/dnf) to the
-- roster RPC — needed for the creator dashboard's "abandons" count
-- (members whose user_books.status for this book is 'dnf'), which wasn't
-- derivable from the roster response before. Same drop-first requirement as
-- 040_shared_reading_ratings.sql: CREATE OR REPLACE can't change a
-- function's return row type on its own.
drop function if exists get_shared_reading_roster(uuid);

create or replace function get_shared_reading_roster(p_reading_id uuid)
returns table(user_id uuid, username varchar, avatar_url text, progress_percent numeric, rating numeric, status varchar)
language plpgsql security definer set search_path = public as $$
declare
  v_book_id uuid;
begin
  if not exists (
    select 1 from shared_readings r
    left join shared_reading_members m on m.shared_reading_id = r.id and m.user_id = auth.uid()
    where r.id = p_reading_id and (r.is_public or r.creator_id = auth.uid() or m.user_id is not null)
  ) then
    raise exception 'Accès refusé';
  end if;

  select book_id into v_book_id from shared_readings where id = p_reading_id;

  return query
    select p.id, p.username, p.avatar_url, coalesce(ub.progress_percent, 0), srm.rating, ub.status
    from shared_reading_members srm
    join profiles p on p.id = srm.user_id
    left join user_books ub on ub.user_id = srm.user_id and ub.book_id = v_book_id
    where srm.shared_reading_id = p_reading_id
    order by coalesce(ub.progress_percent, 0) desc;
end;
$$;
