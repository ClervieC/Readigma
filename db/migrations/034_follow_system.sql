-- Replaces the old mutual "friendships" model (request + acceptance) with a
-- simple asymmetric "follow" (like Twitter/Instagram) — following someone
-- needs no acceptance from them. See lib/follows.ts (replacing lib/friends.ts)
-- and app/friends/* for the client side.

create table follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references profiles(id) on delete cascade,
  followee_id  uuid not null references profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

alter table follows enable row level security;

-- Unlike the old friendships table (visible only to the two people
-- involved), a follow relationship is visible to any signed-in user —
-- follower/following lists and counts are meant to be public on a profile,
-- same as who-follows-who on any other social app. Only the follower
-- themself can create or remove their own follow row.
create policy follows_select_any on follows for select
  to authenticated using (true);
create policy follows_insert_as_follower on follows for insert
  to authenticated with check (follower_id = auth.uid());
create policy follows_delete_as_follower on follows for delete
  to authenticated using (follower_id = auth.uid());

-- Data migration: every existing friendship (pending or accepted) becomes at
-- least "requester follows receiver" — they were the one who wanted the
-- connection either way. An *accepted* friendship additionally becomes
-- "receiver follows requester" too, preserving the old mutual relationship
-- as two follow rows instead of one bidirectional one.
insert into follows (follower_id, followee_id)
select requester_id, receiver_id from friendships
union
select receiver_id, requester_id from friendships where status = 'accepted'
on conflict (follower_id, followee_id) do nothing;

-- get_feed()/is_feed_visible(): "people I follow" replaces "my accepted
-- friends, either direction" — one-directional now, and no 'accepted'
-- filter since a follow needs no acceptance.
create or replace function get_feed()
returns table (
  id uuid, user_id uuid, username text, avatar_url text,
  book_id uuid, book_title text, book_author text, cover_url text,
  genres text[], description text, published_year int,
  activity_type text, metadata jsonb,
  emoji text, note text, reaction_percent numeric,
  like_count bigint, liked_by_me boolean, comment_count bigint,
  created_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select
    af.id, af.user_id, p.username, p.avatar_url,
    b.id, b.title, b.author, b.cover_url,
    b.genres, b.description, b.published_year,
    af.activity_type, af.metadata,
    rr.emoji, rr.note, rr.progress_percent,
    coalesce(lc.count, 0), coalesce(ml.liked, false), coalesce(cc.count, 0),
    af.created_at
  from activity_feed af
  join profiles p on p.id = af.user_id
  left join books b on b.id = af.book_id
  left join reading_reactions rr on rr.id = af.reaction_id
  left join (select feed_id, count(*) as count from feed_likes group by feed_id) lc on lc.feed_id = af.id
  left join (select feed_id, count(*) as count from feed_comments group by feed_id) cc on cc.feed_id = af.id
  left join (select feed_id, true as liked from feed_likes where user_id = auth.uid()) ml on ml.feed_id = af.id
  where af.user_id = auth.uid()
     or af.user_id in (select followee_id from follows where follower_id = auth.uid())
  order by af.created_at desc
  limit 50;
$$;

create or replace function is_feed_visible(p_feed_id uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from activity_feed af
    where af.id = p_feed_id
      and (
        af.user_id = auth.uid()
        or af.user_id in (select followee_id from follows where follower_id = auth.uid())
      )
  );
$$;

-- friend_profile() -> get_user_profile(): body is unchanged (it was never
-- actually friendship-gated — any signed-in user could already call it for
-- any p_user_id) except currently_reading now also carries the book's id,
-- so the client can link straight to /book/[id] instead of a dead-end card.
create or replace function get_user_profile(p_user_id uuid)
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
    count(*) filter (where ub.format = 'physical'),
    count(*) filter (where ub.format = 'ereader'),
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
drop function if exists friend_profile(uuid);

-- list_friends() -> list_following()/list_followers(). list_followers()
-- additionally reports whether *I* already follow that follower back, so
-- the UI can offer "Suivre en retour" vs. just "Abonné(e)".
create or replace function list_following()
returns table (id uuid, username text, avatar_url text, books_count bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.username, p.avatar_url, count(ub.id) filter (where ub.status = 'done')
  from follows f
  join profiles p on p.id = f.followee_id
  left join user_books ub on ub.user_id = p.id
  where f.follower_id = auth.uid()
  group by p.id;
$$;

create or replace function list_followers()
returns table (id uuid, username text, avatar_url text, books_count bigint, followed_back boolean)
language sql security definer set search_path = public stable as $$
  select p.id, p.username, p.avatar_url, count(ub.id) filter (where ub.status = 'done'),
    exists(select 1 from follows fb where fb.follower_id = auth.uid() and fb.followee_id = p.id)
  from follows f
  join profiles p on p.id = f.follower_id
  left join user_books ub on ub.user_id = p.id
  where f.followee_id = auth.uid()
  group by p.id;
$$;
drop function if exists list_friends();
-- No follow equivalent — following needs no acceptance, so there's no
-- pending-request inbox left to list.
drop function if exists list_pending_requests();

-- friends_avg_books_this_year() -> following_avg_books_this_year(): same
-- "how do I compare" stats card on app/stats.tsx, scoped to who I follow.
create or replace function following_avg_books_this_year()
returns table (following_count int, avg_books numeric)
language sql security definer set search_path = public stable as $$
  with following_ids as (
    select followee_id as id from follows where follower_id = auth.uid()
  ),
  counts as (
    select fi.id, count(ub.id) as cnt
    from following_ids fi
    left join user_books ub on ub.user_id = fi.id and ub.status = 'done'
      and extract(year from ub.finished_at) = extract(year from now())
    group by fi.id
  )
  select (select count(*) from following_ids)::int, round(avg(cnt)::numeric, 1) from counts;
$$;
drop function if exists friends_avg_books_this_year();

drop table friendships;
