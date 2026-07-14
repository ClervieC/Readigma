-- Readigma — Supabase schema
--
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
-- There is no custom Express backend: table-level RLS lets the client (web +
-- native, via @supabase/supabase-js) talk to Postgres directly through
-- Supabase's auto-generated PostgREST API, and the handful of SQL functions
-- at the bottom replace what used to be custom Express route logic (feed
-- union, randomizer, goal math, friend stats, popular books).

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    varchar(255) not null unique,
  avatar_url  text,
  role        varchar(20) not null default 'user', -- 'user' | 'admin'
  created_at  timestamptz not null default now()
);

-- Kept out of `profiles` (which is world-readable to any signed-in user, by
-- design, for friend search/feed authorship) so a push token — meant only
-- for our own server-side push/send route to read — is never exposed to
-- other clients through PostgREST. Owner-only RLS below; the push/send route
-- reads it with the service_role key, which bypasses RLS entirely.
create table push_tokens (
  user_id     uuid primary key references profiles(id) on delete cascade,
  token       text not null,
  updated_at  timestamptz not null default now()
);

create table books (
  id               uuid primary key default gen_random_uuid(),
  external_id      varchar(255) not null unique, -- Open Library work id, e.g. "OL893415W"
  title            varchar(500) not null,
  author           varchar(500),
  cover_url        text,
  description      text,
  genres           text[] not null default '{}',
  tropes           text[] not null default '{}',
  published_year   int,
  approved         boolean not null default false,
  created_at       timestamptz not null default now()
);

create table user_books (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  status           varchar(20) not null default 'to_read', -- 'to_read' | 'reading' | 'done' | 'dnf'
  format           varchar(20),                             -- 'physical' | 'ereader'
  rating           numeric(3,2),                            -- quarter-point increments, 0–5
  comment          text,
  current_page     int not null default 0,
  total_pages      int not null default 0,
  progress_percent numeric(5,2) not null default 0,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, book_id),
  constraint rating_range check (rating is null or (rating >= 0 and rating <= 5))
);

create table friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id) on delete cascade,
  receiver_id   uuid not null references profiles(id) on delete cascade,
  status        varchar(20) not null default 'pending', -- 'pending' | 'accepted'
  created_at    timestamptz not null default now()
);

create table reading_reactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  emoji            varchar(16),
  note             text,
  progress_percent numeric(5,2),
  page_number      int,
  is_public        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table activity_feed (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  book_id        uuid references books(id) on delete set null,
  activity_type  varchar(30) not null, -- 'progress_update' | 'reaction' | 'finished'
  reaction_id    uuid references reading_reactions(id) on delete set null,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

create table reading_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  year          int not null,
  target_books  int not null,
  unique (user_id, year)
);

create table book_suggestions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       varchar(500) not null,
  author      varchar(500),
  message     text,
  status      varchar(20) not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at  timestamptz not null default now()
);

-- Manual start/stop reading-session timer (lib/timer.ts). At most one
-- session per user has ended_at null (the "currently running" one) — the
-- app stops any other running session before starting a new one, rather
-- than this being enforced in SQL, since a partial-unique-index-on-null
-- constraint would fight the upsert-ish start/stop flow for little benefit.
create table reading_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int
);

-- Computes duration_seconds itself the moment ended_at is set, rather than
-- trusting a client-sent value — same reasoning as user_books_before_write.
create or replace function reading_sessions_before_write() returns trigger language plpgsql as $$
begin
  if new.ended_at is not null then
    new.duration_seconds = greatest(0, extract(epoch from (new.ended_at - new.started_at))::int);
  end if;
  return new;
end;
$$;

create trigger reading_sessions_before_write
  before insert or update on reading_sessions
  for each row execute function reading_sessions_before_write();

-- Replaces what the old Express `PUT /me/books/:bookId` and
-- `PUT /me/books/:bookId/progress` handlers computed in JS: quarter-point
-- rating rounding, recomputing progress_percent from pages when both are
-- given, and stamping finished_at/started_at. Keyed off an actual status
-- *transition* (new.status is distinct from old.status) rather than firing
-- whenever the request merely repeats the same status — tighter than the
-- original, which re-stamped finished_at on every save that echoed
-- status='done' (e.g. editing a rating afterwards would have bumped it).
create or replace function user_books_before_write() returns trigger language plpgsql as $$
begin
  new.updated_at = now();

  if new.rating is not null then
    new.rating = round(new.rating * 4) / 4;
  end if;

  if new.total_pages > 0 and new.current_page is not null then
    new.progress_percent = round((new.current_page::numeric / new.total_pages) * 100, 2);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'done' then
      new.finished_at = now();
    elsif new.status = 'reading' and old.started_at is null then
      new.started_at = now();
    end if;
  end if;

  return new;
end;
$$;

create trigger user_books_before_write
  before insert or update on user_books
  for each row execute function user_books_before_write();

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table push_tokens enable row level security;
alter table books enable row level security;
alter table user_books enable row level security;
alter table friendships enable row level security;
alter table reading_reactions enable row level security;
alter table activity_feed enable row level security;
alter table reading_goals enable row level security;
alter table book_suggestions enable row level security;
alter table reading_sessions enable row level security;

-- profiles: usernames/avatars are the app's public identity, readable by any
-- signed-in user (needed for friend search, feed authorship, friend requests).
create policy profiles_select_all on profiles for select
  to authenticated using (true);
create policy profiles_insert_self on profiles for insert
  to authenticated with check (id = auth.uid());
create policy profiles_update_self on profiles for update
  to authenticated using (id = auth.uid());

-- push_tokens: owner can save their own device token; never readable by
-- anyone else through PostgREST — only the push/send server route (which
-- uses the service_role key, not a client bearer token) reads it.
create policy push_tokens_owner on push_tokens for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- books: shared catalog, readable/addable by any signed-in user (mirrors the
-- old /books search-and-upsert endpoint, which had no per-user ownership).
create policy books_select_all on books for select
  to authenticated using (true);
create policy books_insert_any on books for insert
  to authenticated with check (true);
create policy books_update_any on books for update
  to authenticated using (true);

-- user_books, reading_reactions, activity_feed, reading_goals: strictly
-- owner-only at the table level. Friends only ever see a narrow, specific
-- slice of this data (the feed, a friend's currently-reading books, stats) —
-- that cross-user visibility is implemented in the `security definer`
-- functions below, never by relaxing these table policies.
create policy user_books_owner on user_books for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reading_reactions_owner on reading_reactions for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy activity_feed_owner_select on activity_feed for select
  to authenticated using (user_id = auth.uid());
create policy activity_feed_owner_insert on activity_feed for insert
  to authenticated with check (user_id = auth.uid());
create policy reading_goals_owner on reading_goals for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- friendships: visible/editable only to the two people involved. Only the
-- receiver can accept or delete (decline/remove), matching the old
-- `PUT /request/:id/accept` and `DELETE /request/:id` behavior exactly.
create policy friendships_select_involved on friendships for select
  to authenticated using (requester_id = auth.uid() or receiver_id = auth.uid());
create policy friendships_insert_as_requester on friendships for insert
  to authenticated with check (requester_id = auth.uid());
create policy friendships_update_as_receiver on friendships for update
  to authenticated using (receiver_id = auth.uid());
create policy friendships_delete_as_receiver on friendships for delete
  to authenticated using (receiver_id = auth.uid());

-- book_suggestions: authors see their own; admins (profiles.role = 'admin')
-- see and moderate all, replacing the old `/suggestions/admin` routes.
create policy book_suggestions_insert_self on book_suggestions for insert
  to authenticated with check (user_id = auth.uid());
create policy book_suggestions_select on book_suggestions for select
  to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy book_suggestions_update_admin on book_suggestions for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- reading_sessions: owner-only, same shape as user_books/reading_reactions.
create policy reading_sessions_owner on reading_sessions for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- Functions (replace old Express business logic, called via the Data API's
-- POST /rpc/<name> convention). `security invoker` ones only ever touch the
-- caller's own rows and stay behind the RLS policies above as defense in
-- depth; `security definer` ones are the sole sanctioned path to read a
-- narrow, specific slice of *other* users' data, with `search_path` pinned
-- per Postgres's security-definer hardening guidance.
-- ============================================================================

create or replace function get_feed()
returns table (
  id uuid, user_id uuid, username text, avatar_url text,
  book_id uuid, book_title text, book_author text, cover_url text,
  genres text[], description text, published_year int,
  activity_type text, metadata jsonb,
  emoji text, note text, reaction_percent numeric,
  created_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select
    af.id, af.user_id, p.username, p.avatar_url,
    b.id, b.title, b.author, b.cover_url,
    b.genres, b.description, b.published_year,
    af.activity_type, af.metadata,
    rr.emoji, rr.note, rr.progress_percent,
    af.created_at
  from activity_feed af
  join profiles p on p.id = af.user_id
  left join books b on b.id = af.book_id
  left join reading_reactions rr on rr.id = af.reaction_id
  where af.user_id = auth.uid()
     or af.user_id in (
       select case when f.requester_id = auth.uid() then f.receiver_id else f.requester_id end
       from friendships f
       where f.status = 'accepted'
         and (f.requester_id = auth.uid() or f.receiver_id = auth.uid())
     )
  order by af.created_at desc
  limit 50;
$$;

create or replace function randomize_book(p_genre text default null, p_trope text default null)
returns table (
  book_id uuid, title varchar, author varchar, cover_url text, description text,
  genres text[], tropes text[], published_year int
)
language sql security invoker stable as $$
  select b.id, b.title, b.author, b.cover_url, b.description, b.genres, b.tropes, b.published_year
  from user_books ub
  join books b on b.id = ub.book_id
  where ub.user_id = auth.uid()
    and ub.status = 'to_read'
    and (p_genre is null or p_genre = any(b.genres))
    and (p_trope is null or p_trope = any(b.tropes))
  order by random()
  limit 1;
$$;

create or replace function goal_progress(p_year int)
returns table (target_books int, books_read bigint)
language sql security invoker stable as $$
  select
    (select rg.target_books from reading_goals rg where rg.user_id = auth.uid() and rg.year = p_year),
    (select count(*) from user_books ub
       where ub.user_id = auth.uid() and ub.status = 'done'
         and extract(year from ub.finished_at) = p_year);
$$;

create or replace function goal_monthly(p_year int)
returns table (month int, count bigint)
language sql security invoker stable as $$
  select m.month, coalesce(c.count, 0)
  from generate_series(1, 12) as m(month)
  left join (
    select extract(month from ub.finished_at)::int as month, count(*) as count
    from user_books ub
    where ub.user_id = auth.uid() and ub.status = 'done'
      and extract(year from ub.finished_at) = p_year
    group by 1
  ) c on c.month = m.month
  order by m.month;
$$;

create or replace function friend_profile(p_user_id uuid)
returns table (
  username text, avatar_url text,
  done_count bigint, to_read_count bigint, reading_count bigint, avg_rating numeric,
  currently_reading jsonb
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
        'title', b2.title, 'author', b2.author, 'genres', b2.genres,
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
    ), '[]'::jsonb)
  from profiles p
  left join user_books ub on ub.user_id = p.id
  where p.id = p_user_id
  group by p.username, p.avatar_url;
$$;

create or replace function search_users(p_query text)
returns table (id uuid, username text, avatar_url text, books_count bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.username, p.avatar_url, count(ub.id) filter (where ub.status = 'done')
  from profiles p
  left join user_books ub on ub.user_id = p.id
  where p.username ilike '%' || p_query || '%' and p.id <> auth.uid()
  group by p.id
  limit 20;
$$;

create or replace function list_friends()
returns table (id uuid, username text, avatar_url text, books_count bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.username, p.avatar_url, count(ub.id) filter (where ub.status = 'done')
  from friendships f
  join profiles p on p.id = case when f.requester_id = auth.uid() then f.receiver_id else f.requester_id end
  left join user_books ub on ub.user_id = p.id
  where f.status = 'accepted' and (f.requester_id = auth.uid() or f.receiver_id = auth.uid())
  group by p.id;
$$;

-- security invoker (not definer, unlike the two above): friendships RLS
-- already lets the receiver see their own pending rows, and profiles are
-- readable by any signed-in user, so no cross-user RLS gap to bridge here.
create or replace function list_pending_requests()
returns table (id uuid, username text, avatar_url text, created_at timestamptz)
language sql security invoker stable as $$
  select f.id, p.username, p.avatar_url, f.created_at
  from friendships f
  join profiles p on p.id = f.requester_id
  where f.receiver_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

create or replace function popular_books()
returns table (
  book_id uuid, title varchar, author varchar, cover_url text, description text,
  genres text[], published_year int, add_count bigint
)
language sql security definer set search_path = public stable as $$
  select b.id, b.title, b.author, b.cover_url, b.description, b.genres, b.published_year, count(ub.id)
  from books b
  join user_books ub on ub.book_id = b.id
  where b.approved = true
  group by b.id
  order by count(ub.id) desc
  limit 10;
$$;

-- Backs the timer card on a book's detail page (lib/timer.ts).
create or replace function book_reading_time(p_book_id uuid)
returns bigint
language sql security invoker stable as $$
  select coalesce(sum(duration_seconds), 0)
  from reading_sessions
  where user_id = auth.uid() and book_id = p_book_id and duration_seconds is not null;
$$;

-- Backs the profile screen's reading-time stat (lib/timer.ts).
create or replace function reading_time_stats()
returns table (total_seconds bigint, month_seconds bigint)
language sql security invoker stable as $$
  select
    coalesce(sum(duration_seconds), 0),
    coalesce(sum(duration_seconds) filter (where started_at >= date_trunc('month', now())), 0)
  from reading_sessions
  where user_id = auth.uid() and duration_seconds is not null;
$$;

-- Physical vs. e-reader split for the profile screen (lib/userBooks.ts) —
-- counts every book the reader has tagged with a format, any status.
create or replace function format_stats()
returns table (physical_count bigint, ereader_count bigint)
language sql security invoker stable as $$
  select
    count(*) filter (where format = 'physical'),
    count(*) filter (where format = 'ereader')
  from user_books
  where user_id = auth.uid();
$$;
