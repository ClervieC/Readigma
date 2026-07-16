-- Extra stats for app/stats.tsx: reading streak, busiest day of the week,
-- longest/fastest book read, and a friends comparison. Run once in the
-- Supabase SQL editor.

-- Consecutive days (ending today or yesterday — so it doesn't zero out
-- before you've logged today's session yet) with at least one reading
-- session.
create or replace function reading_streak()
returns int
language sql security invoker stable as $$
  with days as (
    select distinct date(started_at) as d
    from reading_sessions
    where user_id = auth.uid()
  ),
  numbered as (
    select d, d - (row_number() over (order by d))::int as grp
    from days
  ),
  streaks as (
    select grp, count(*) as len, max(d) as last_day
    from numbered
    group by grp
  )
  select coalesce(
    (select len from streaks where last_day >= current_date - 1 order by last_day desc limit 1),
    0
  );
$$;

-- Total reading time per day of week (0 = Sunday .. 6 = Saturday, matching
-- Postgres's extract(dow)) — the app picks the max client-side.
create or replace function reading_stats_by_weekday()
returns table (weekday int, seconds bigint)
language sql security invoker stable as $$
  select extract(dow from started_at)::int as weekday, sum(coalesce(duration_seconds, 0)) as seconds
  from reading_sessions
  where user_id = auth.uid()
  group by 1
  order by 1;
$$;

-- The single longest and single fastest read, by calendar days from
-- started_at to finished_at.
create or replace function reading_stats_extremes()
returns table (
  longest_book_id uuid, longest_title text, longest_days numeric,
  fastest_book_id uuid, fastest_title text, fastest_days numeric
)
language sql security invoker stable as $$
  with done as (
    select ub.book_id, b.title, extract(epoch from (ub.finished_at - ub.started_at)) / 86400 as days
    from user_books ub
    join books b on b.id = ub.book_id
    where ub.user_id = auth.uid() and ub.status = 'done'
      and ub.started_at is not null and ub.finished_at is not null and ub.finished_at > ub.started_at
  )
  select
    (select book_id from done order by days desc limit 1),
    (select title from done order by days desc limit 1),
    (select round(days::numeric, 1) from done order by days desc limit 1),
    (select book_id from done order by days asc limit 1),
    (select title from done order by days asc limit 1),
    (select round(days::numeric, 1) from done order by days asc limit 1);
$$;

-- Average books finished this year across the caller's accepted friends —
-- security definer since it reads other users' user_books, same pattern as
-- list_friends()/friend_profile() above.
create or replace function friends_avg_books_this_year()
returns table (friend_count int, avg_books numeric)
language sql security definer set search_path = public stable as $$
  with friend_ids as (
    select case when f.requester_id = auth.uid() then f.receiver_id else f.requester_id end as id
    from friendships f
    where f.status = 'accepted' and (f.requester_id = auth.uid() or f.receiver_id = auth.uid())
  ),
  counts as (
    select fi.id, count(ub.id) as cnt
    from friend_ids fi
    left join user_books ub on ub.user_id = fi.id and ub.status = 'done'
      and extract(year from ub.finished_at) = extract(year from now())
    group by fi.id
  )
  select (select count(*) from friend_ids)::int, round(avg(cnt)::numeric, 1) from counts;
$$;
