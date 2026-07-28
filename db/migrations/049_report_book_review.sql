-- Lets a review be reported (app/report.tsx, lib/reports.ts) — reuses the
-- existing generic report flow instead of a dedicated moderation system,
-- same approach as 046's shared_reading_message support. book_reviews()
-- didn't return anything identifying *which* row a review came from, so a
-- report had nothing stable to reference — user_books.id (one row = one
-- book+user pair = one review) is the natural target_id.
alter table reports drop constraint reports_target_type_check;
alter table reports add constraint reports_target_type_check
  check (target_type in ('book', 'user', 'shared_reading_message', 'book_review'));

-- Return type is changing (new review_id column), so the old signature has
-- to be dropped first — same gotcha as get_shared_reading_roster's history.
drop function if exists book_reviews(uuid);

create or replace function book_reviews(p_book_id uuid)
returns table (review_id uuid, username text, avatar_url text, rating numeric, comment text, finished_at timestamptz)
language sql security definer set search_path = public stable as $$
  select ub.id, p.username, p.avatar_url, ub.rating, ub.comment, ub.finished_at
  from user_books ub
  join profiles p on p.id = ub.user_id
  where ub.book_id = p_book_id
    and ub.status = 'done'
    and (ub.rating is not null or ub.comment is not null)
  order by ub.finished_at desc nulls last
  limit 50;
$$;
