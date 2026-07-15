-- Adds the two RPCs behind the book detail screen's new "Avis de la
-- communauté" section: an aggregate rating average and the list of other
-- readers' ratings/comments for a book. Both need security definer since
-- they read other users' user_books rows (finished-book ratings/comments
-- only), which the owner-only RLS on user_books would otherwise block —
-- same pattern as friend_profile()/popular_books() in schema.sql.

create or replace function book_rating_stats(p_book_id uuid)
returns table (avg_rating numeric, ratings_count int)
language sql security definer set search_path = public stable as $$
  select round(avg(rating), 2), count(rating)::int
  from user_books
  where book_id = p_book_id and status = 'done' and rating is not null;
$$;

create or replace function book_reviews(p_book_id uuid)
returns table (username text, avatar_url text, rating numeric, comment text, finished_at timestamptz)
language sql security definer set search_path = public stable as $$
  select p.username, p.avatar_url, ub.rating, ub.comment, ub.finished_at
  from user_books ub
  join profiles p on p.id = ub.user_id
  where ub.book_id = p_book_id
    and ub.status = 'done'
    and (ub.rating is not null or ub.comment is not null)
  order by ub.finished_at desc nulls last
  limit 50;
$$;
