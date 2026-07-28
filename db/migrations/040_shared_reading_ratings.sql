-- "Parfois un livre est meilleur parce qu'on le lit en groupe" — a rating of
-- the *shared reading experience itself*, distinct from the book's own
-- personal rating (user_books.rating, set on the book detail screen).
-- Lives directly on the membership row (1:1 with a member's participation)
-- rather than a separate table, since there's nothing else to store with it.
alter table shared_reading_members add column rating numeric(3,2)
  check (rating is null or (rating >= 0 and rating <= 5));

-- Re-declares get_shared_reading_roster (originally in
-- 038_shared_readings.sql) to also return the new rating column. Postgres
-- won't let CREATE OR REPLACE change a function's return row type (adding a
-- column counts as changing it) — the old signature has to be dropped first.
drop function if exists get_shared_reading_roster(uuid);

create or replace function get_shared_reading_roster(p_reading_id uuid)
returns table(user_id uuid, username varchar, avatar_url text, progress_percent numeric, rating numeric)
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
    select p.id, p.username, p.avatar_url, coalesce(ub.progress_percent, 0), srm.rating
    from shared_reading_members srm
    join profiles p on p.id = srm.user_id
    left join user_books ub on ub.user_id = srm.user_id and ub.book_id = v_book_id
    where srm.shared_reading_id = p_reading_id
    order by coalesce(ub.progress_percent, 0) desc;
end;
$$;
