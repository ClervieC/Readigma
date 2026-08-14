-- shared_reading_messages was book-discussion only: every message carries a
-- percent_threshold and get_shared_reading_messages() hides it from anyone
-- who hasn't read that far yet (the anti-spoiler gate). That's the wrong
-- behavior for plain chit-chat that has nothing to do with the book itself
-- ("how's everyone's week going") — kind lets those messages skip the gate
-- entirely instead of being hidden from members who are behind.
alter table shared_reading_messages add column if not exists kind varchar(10) not null default 'book';
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'shared_reading_messages_kind_check'
  ) then
    alter table shared_reading_messages add constraint shared_reading_messages_kind_check check (kind in ('book', 'general'));
  end if;
end $$;

-- Postgres won't let create-or-replace change a function's return row type
-- (adding the `kind` column counts as one), so the old signature has to go
-- first.
drop function if exists get_shared_reading_messages(uuid);

create or replace function get_shared_reading_messages(p_reading_id uuid)
returns table(id uuid, user_id uuid, username varchar, avatar_url text, content text, percent_threshold numeric, created_at timestamptz, kind varchar)
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
    select m.id, m.user_id, p.username, p.avatar_url, m.content, m.percent_threshold, m.created_at, m.kind
    from shared_reading_messages m
    join profiles p on p.id = m.user_id
    where m.shared_reading_id = p_reading_id
      and (m.kind = 'general' or m.percent_threshold <= v_my_percent)
    order by m.created_at asc;
end;
$$;
