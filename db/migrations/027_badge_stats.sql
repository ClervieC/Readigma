-- Backs the badges page (app/badges.tsx, lib/badges.ts) — badges themselves
-- aren't stored anywhere (no "earned badges" table); every tier is just
-- recomputed live from these counts each time the page loads, so there's
-- nothing to backfill/keep in sync if a badge's thresholds ever change.
-- Run once in the Supabase SQL editor.

create or replace function badge_stats()
returns table (
  done_count bigint,
  to_read_count bigint,
  reading_count bigint,
  total_reading_seconds bigint,
  streak_days int,
  distinct_genres bigint,
  distinct_authors_read bigint
)
language sql security invoker stable as $$
  select
    (select count(*) from user_books where user_id = auth.uid() and status = 'done'),
    (select count(*) from user_books where user_id = auth.uid() and status = 'to_read'),
    (select count(*) from user_books where user_id = auth.uid() and status = 'reading'),
    (select coalesce(sum(duration_seconds), 0) from reading_sessions where user_id = auth.uid() and duration_seconds is not null),
    reading_streak(),
    (select count(distinct trim(g))
       from user_books ub
       join books b on b.id = ub.book_id
       cross join lateral unnest(b.genres) as raw_g
       cross join lateral unnest(string_to_array(raw_g, ',')) as g
       where ub.user_id = auth.uid() and ub.status = 'done' and trim(g) <> ''),
    (select count(distinct b.author)
       from user_books ub
       join books b on b.id = ub.book_id
       where ub.user_id = auth.uid() and ub.status = 'done' and b.author is not null);
$$;
