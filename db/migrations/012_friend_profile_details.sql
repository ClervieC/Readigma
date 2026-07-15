-- Expands friend_profile() with everything app/friends/[id].tsx now shows
-- for a friend: their current-year reading goal, reading format split,
-- total reading time, and their own rated/commented books — mirrors what
-- goal_progress()/format_stats()/reading_time_stats() already compute for
-- the *caller's own* data (those stay security invoker / auth.uid()-scoped;
-- this is the security definer path for viewing someone else's). Run once
-- in the Supabase SQL editor.

-- Return shape is changing (more columns) — CREATE OR REPLACE can't do that.
drop function if exists friend_profile(uuid);

create function friend_profile(p_user_id uuid)
returns table (
  username text, avatar_url text,
  done_count bigint, to_read_count bigint, reading_count bigint, avg_rating numeric,
  currently_reading jsonb,
  goal_target int, goal_books_read bigint,
  physical_count bigint, ereader_count bigint,
  reading_seconds bigint,
  reviews jsonb
)
language sql security definer set search_path = public stable as $$
  select
    p.username, p.avatar_url,
    count(*) filter (where ub.status = 'done'),
    count(*) filter (where ub.status = 'to_read'),
    count(*) filter (where ub.status = 'reading'),
    round(avg(ub.rating) filter (where ub.rating is not null), 2),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', b2.title, 'author', b2.author, 'genres', b2.genres, 'cover_url', b2.cover_url,
        'progress_percent', ub2.progress_percent,
        'current_page', ub2.current_page, 'total_pages', ub2.total_pages
      ) order by ub2.updated_at desc)
      from (
        select * from user_books
        where user_id = p_user_id and status = 'reading'
        order by updated_at desc
        limit 3
      ) ub2
      join books b2 on b2.id = ub2.book_id
    ), '[]'::jsonb),
    (select rg.target_books from reading_goals rg where rg.user_id = p_user_id and rg.year = extract(year from now())::int),
    (select count(*) from user_books ub3
       where ub3.user_id = p_user_id and ub3.status = 'done'
         and extract(year from ub3.finished_at) = extract(year from now())),
    count(*) filter (where ub.format = 'physical'),
    count(*) filter (where ub.format = 'ereader'),
    (select coalesce(sum(rs.duration_seconds), 0) from reading_sessions rs where rs.user_id = p_user_id and rs.duration_seconds is not null),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', b3.title, 'author', b3.author, 'cover_url', b3.cover_url,
        'rating', ub4.rating, 'comment', ub4.comment, 'finished_at', ub4.finished_at
      ) order by ub4.finished_at desc nulls last)
      from user_books ub4
      join books b3 on b3.id = ub4.book_id
      where ub4.user_id = p_user_id and ub4.status = 'done'
        and (ub4.rating is not null or ub4.comment is not null)
    ), '[]'::jsonb)
  from profiles p
  left join user_books ub on ub.user_id = p.id
  where p.id = p_user_id
  group by p.username, p.avatar_url;
$$;
