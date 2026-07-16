-- Backs the new stats page (app/stats.tsx, lib/stats.ts): overall reading
-- numbers plus a top-genres breakdown. Both security invoker/auth.uid()-
-- scoped, same pattern as goal_progress()/reading_time_stats()/format_stats
-- above — every reader only ever sees their own stats through these. Run
-- once in the Supabase SQL editor.

create or replace function reading_stats_overview()
returns table (
  total_done bigint,
  books_this_month bigint,
  books_this_year bigint,
  avg_days_to_finish numeric,
  avg_reading_seconds_per_book numeric,
  favorite_author text,
  favorite_author_count bigint,
  avg_rating numeric
)
language sql security invoker stable as $$
  with done as (
    select * from user_books where user_id = auth.uid() and status = 'done'
  ),
  author_counts as (
    select b.author, count(*) as c
    from done ub join books b on b.id = ub.book_id
    where b.author is not null
    group by b.author
    order by c desc, b.author
    limit 1
  ),
  session_totals as (
    select ub.book_id, sum(rs.duration_seconds) as secs
    from done ub
    join reading_sessions rs on rs.book_id = ub.book_id and rs.user_id = auth.uid() and rs.duration_seconds is not null
    group by ub.book_id
  )
  select
    (select count(*) from done),
    (select count(*) from done where finished_at >= date_trunc('month', now())),
    (select count(*) from done where finished_at >= date_trunc('year', now())),
    (select round(avg(extract(epoch from (finished_at - started_at)) / 86400)::numeric, 1)
       from done where started_at is not null and finished_at is not null and finished_at > started_at),
    (select round(avg(secs)::numeric, 0) from session_totals),
    (select author from author_counts),
    (select c from author_counts),
    (select round(avg(rating)::numeric, 2) from done where rating is not null);
$$;

-- Top 5 genres among finished books. books.genres entries are sometimes
-- themselves comma-joined phrases (see normalizeTags in lib/books.ts) rather
-- than one tag per array element, so this splits each entry on commas too
-- before counting, matching how the app displays genres everywhere else.
create or replace function reading_stats_genres()
returns table (genre text, count bigint)
language sql security invoker stable as $$
  select trim(g) as genre, count(*) as count
  from user_books ub
  join books b on b.id = ub.book_id
  cross join lateral unnest(b.genres) as raw_g
  cross join lateral unnest(string_to_array(raw_g, ',')) as g
  where ub.user_id = auth.uid() and ub.status = 'done' and trim(g) <> ''
  group by trim(g)
  order by count desc
  limit 5;
$$;
