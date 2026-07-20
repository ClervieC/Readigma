-- Replaces user_books.format (single 'physical' | 'ereader' value) with
-- formats text[] so a book can carry any combination of 'physical',
-- 'ereader', and the new 'audiobook' option. Safe to run more than once.

alter table user_books add column if not exists formats text[] not null default '{}';

update user_books set formats = array[format]
where format is not null and formats = '{}';

alter table user_books drop column if exists format;

drop function if exists get_user_profile(uuid);

create or replace function get_user_profile(p_user_id uuid)
returns table (
  username text, avatar_url text,
  done_count bigint, to_read_count bigint, reading_count bigint, avg_rating numeric,
  currently_reading jsonb,
  goal_target int, goal_books_read bigint,
  physical_count bigint, ereader_count bigint, audiobook_count bigint,
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
        'id', b2.id, 'title', b2.title, 'author', b2.author, 'genres', b2.genres, 'cover_url', b2.cover_url,
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
    count(*) filter (where 'physical' = any(ub.formats)),
    count(*) filter (where 'ereader' = any(ub.formats)),
    count(*) filter (where 'audiobook' = any(ub.formats)),
    (select coalesce(sum(rs.duration_seconds), 0) from reading_sessions rs where rs.user_id = p_user_id and rs.duration_seconds is not null),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b3.id, 'title', b3.title, 'author', b3.author, 'cover_url', b3.cover_url,
        'rating', ub4.rating, 'comment', ub4.comment, 'finished_at', ub4.finished_at
      ) order by ub4.finished_at desc nulls last)
      from user_books ub4
      join books b3 on b3.id = ub4.book_id
      where ub4.user_id = p_user_id and ub4.status = 'done'
    ), '[]'::jsonb)
  from profiles p
  left join user_books ub on ub.user_id = p.id
  where p.id = p_user_id
  group by p.username, p.avatar_url;
$$;

drop function if exists format_stats();

create or replace function format_stats()
returns table (physical_count bigint, ereader_count bigint, audiobook_count bigint)
language sql security invoker stable as $$
  select
    count(*) filter (where 'physical' = any(formats)),
    count(*) filter (where 'ereader' = any(formats)),
    count(*) filter (where 'audiobook' = any(formats))
  from user_books
  where user_id = auth.uid();
$$;
