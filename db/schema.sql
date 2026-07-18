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
  role             varchar(20) not null default 'user', -- 'user' | 'admin'
  banned           boolean not null default false,
  onboarding_done  boolean not null default false,
  library_view_mode varchar(10) not null default 'shelf', -- 'shelf' | 'grid'
  decorations_unlocked int not null default 0, -- decoration credits earned via
                                                 -- badges (see lib/badges.ts) —
                                                 -- a high-water mark that only
                                                 -- ever goes up, even if the
                                                 -- underlying badge stat later
                                                 -- drops (e.g. a broken streak)
  created_at       timestamptz not null default now()
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
  isbn             varchar(20),
  cover_url        text,
  description      text,
  genres           text[] not null default '{}',
  tropes           text[] not null default '{}',
  published_year   int,
  series           varchar(500),        -- e.g. "Harry Potter" — best-effort from Open Library's
                                         -- `series:X` subject tag, otherwise set manually on the
                                         -- book detail screen (source coverage is too sparse to
                                         -- rely on alone; see app/book/[id].tsx)
  series_index     numeric(5,2),        -- tome/volume number within the series, e.g. 1, 2.5
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
  progress_mode    varchar(10) not null default 'pages',    -- 'pages' | 'percent' — which editor the
                                                             -- reader last used, so Discover and the
                                                             -- book detail screen agree on which one
                                                             -- to show instead of each defaulting to
                                                             -- 'pages' independently

  started_at       timestamptz,
  finished_at      timestamptz,
  shelf_position   integer,                                  -- manual drag/tap order within a status
                                                               -- on the library shelf; null = not yet
                                                               -- manually placed, falls back to created_at
  pile_id          text,                                     -- books sharing a pile_id (same user+status)
                                                               -- render as one manual lying-flat stack;
                                                               -- null = not manually piled
  manual_tilt      smallint,                                 -- -1/0/1 = user-chosen spine tilt on the
                                                               -- shelf; null = automatic (hashed) angle
  shelf_break_before boolean,                                -- true = an empty shelf renders just
                                                               -- before this book's row (see the "+"
                                                               -- divider in reorder mode)
  shelf_gap_before boolean not null default false,            -- horizontal empty space before a book
  shelf_gap_after boolean not null default false,             -- horizontal empty space after a book
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, book_id),
  constraint rating_range check (rating is null or (rating >= 0 and rating <= 5))
);

-- A decorative piece dropped into a status's shelf alongside its books —
-- see migrations 029-031. `position` shares user_books.shelf_position's
-- ordering space for that status so it can sit between books. `kind` 'frame'
-- shows a book cover or photo (book_id/image_url); 'plant' is purely
-- decorative and never sets either.
create table shelf_frames (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  status        varchar(20) not null,
  position      int not null default 0,
  kind          varchar(10) not null default 'frame', -- 'frame' | 'plant'
  book_id       uuid references books(id) on delete set null,
  image_url     text,
  manual_tilt   smallint,     -- -1/0/1 = user-chosen tilt; null = automatic
  created_at    timestamptz not null default now()
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

-- Mirrors admin.tsx's "Ajouter un livre" form exactly (see ManualBook in
-- lib/admin.ts) — a suggestion carries everything needed to add it to the
-- catalog directly; the admin reviews and confirms rather than re-typing it.
create table book_suggestions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  title           varchar(500) not null,
  author          varchar(500),
  isbn            varchar(20),
  message         text,
  cover_url       text,
  description     text,
  genres          text[] not null default '{}',
  published_year  int,
  series          varchar(500),
  series_index    numeric(5,2),
  status          varchar(20) not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at      timestamptz not null default now()
);

-- "Write to the admin" contact form (app/help.tsx) — replaces the old
-- mailto: link with an actual inbox an admin account can read/triage.
create table admin_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  message     text not null,
  status      varchar(20) not null default 'unread', -- 'unread' | 'read' | 'replied'
  reply       text,
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Superseded admin_messages above (one message + one reply) with a real
-- back-and-forth thread — every message either side sends is its own row.
-- See app/contact.tsx (user side) and app/admin.tsx's "Messages" tab (admin
-- side, reading/replying to any user's thread).
create table admin_thread_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade, -- whose thread this belongs to
  sender      varchar(10) not null check (sender in ('user', 'admin')),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- A user reporting a book or another user (app/report.tsx) for admin triage.
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id) on delete cascade,
  target_type  varchar(10) not null check (target_type in ('book', 'user')),
  target_id    uuid not null, -- books.id or profiles.id depending on target_type
  reason       text not null,
  details      text,
  status       varchar(20) not null default 'pending', -- 'pending' | 'reviewed'
  created_at   timestamptz not null default now()
);

-- A user proposing a fix/addition to an existing book's info (e.g. a
-- missing summary or genre) — see app/edit-book-suggestion.tsx. Same
-- approve/reject review pattern as book_suggestions, but patches an
-- existing books row instead of inserting a new one.
create table book_edit_suggestions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  book_id         uuid not null references books(id) on delete cascade,
  description     text,
  genres          text[],
  cover_url       text,
  isbn            varchar(20),
  published_year  int,
  series          varchar(500),
  series_index    numeric(5,2),
  status          varchar(20) not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at      timestamptz not null default now()
);

-- Likes + comments on feed posts (app/(tabs)/feed.tsx). No select policy on
-- either table below — visibility follows the same friend-or-self rule as
-- get_feed()'s union, enforced only through the security definer RPCs near
-- the bottom of this file (is_feed_visible/toggle_feed_like/add_feed_comment/
-- get_feed_comments), never through a relaxed table-level policy.
create table feed_likes (
  id          uuid primary key default gen_random_uuid(),
  feed_id     uuid not null references activity_feed(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (feed_id, user_id)
);

create table feed_comments (
  id          uuid primary key default gen_random_uuid(),
  feed_id     uuid not null references activity_feed(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  comment     text not null,
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

  -- Only re-derive progress_percent from pages when this write actually
  -- touches current_page/total_pages — otherwise a percent-only update
  -- (progress tracked by % rather than page count) would get silently
  -- clobbered back to whatever the last page-based value was.
  if new.total_pages > 0 and new.current_page is not null
     and (tg_op = 'INSERT' or new.current_page is distinct from old.current_page or new.total_pages is distinct from old.total_pages) then
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

-- profiles_update_self/profiles_update_admin (below) only check *which rows*
-- can be targeted, with no column restriction — without this trigger, any
-- signed-in user could PATCH their own row with {"role":"admin"} to
-- self-promote, or {"banned":false} to un-ban themselves. auth.uid() is only
-- populated inside a PostgREST-authenticated request; it's null for the
-- service_role key and for a direct SQL editor/superuser session (both
-- already trusted, e.g. the admin bootstrap UPDATE near the end of this
-- file), so only real end-user sessions are constrained here. A genuine
-- admin (app/admin.tsx's "Utilisateurs" tab) is exempted so they can
-- actually ban/promote other accounts.
create or replace function prevent_role_self_escalation() returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_is_admin boolean;
begin
  if new.role is distinct from old.role or new.banned is distinct from old.banned then
    if auth.uid() is not null then
      select exists (select 1 from profiles where id = auth.uid() and role = 'admin') into caller_is_admin;
      if not caller_is_admin then
        new.role := old.role;
        new.banned := old.banned;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_role_self_escalation
  before update on profiles
  for each row execute function prevent_role_self_escalation();

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table profiles enable row level security;
alter table push_tokens enable row level security;
alter table books enable row level security;
alter table user_books enable row level security;
alter table shelf_frames enable row level security;
alter table friendships enable row level security;
alter table reading_reactions enable row level security;
alter table activity_feed enable row level security;
alter table reading_goals enable row level security;
alter table book_suggestions enable row level security;
alter table admin_messages enable row level security;
alter table admin_thread_messages enable row level security;
alter table reports enable row level security;
alter table book_edit_suggestions enable row level security;
alter table feed_likes enable row level security;
alter table feed_comments enable row level security;
alter table reading_sessions enable row level security;

-- profiles: usernames/avatars are the app's public identity, readable by any
-- signed-in user (needed for friend search, feed authorship, friend requests).
create policy profiles_select_all on profiles for select
  to authenticated using (true);
create policy profiles_insert_self on profiles for insert
  to authenticated with check (id = auth.uid());
create policy profiles_update_self on profiles for update
  to authenticated using (id = auth.uid());
-- Lets an admin target any other profile row (to ban/unban or promote/
-- demote) — combines with profiles_update_self via OR, per Postgres RLS's
-- multiple-permissive-policies rule. prevent_role_self_escalation above is
-- what actually restricts *which columns* a non-admin caller may change.
create policy profiles_update_admin on profiles for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

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
create policy shelf_frames_owner on shelf_frames for all
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

-- admin_messages: sender sees their own; admins see and triage all.
create policy admin_messages_insert_self on admin_messages for insert
  to authenticated with check (user_id = auth.uid());
create policy admin_messages_select on admin_messages for select
  to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy admin_messages_update_admin on admin_messages for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- admin_thread_messages: a user can only post into their own thread as
-- 'user'; an admin can post into anyone's thread as 'admin'. Both sides can
-- read a thread they're party to (the user their own, an admin any of them).
create policy admin_thread_messages_insert on admin_thread_messages for insert
  to authenticated with check (
    (sender = 'user' and user_id = auth.uid())
    or (sender = 'admin' and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  );
create policy admin_thread_messages_select on admin_thread_messages for select
  to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- reports: only the reporter can insert (as themselves); only admins can
-- read/triage — a report shouldn't be visible to its target or anyone else.
create policy reports_insert_self on reports for insert
  to authenticated with check (reporter_id = auth.uid());
create policy reports_select_admin on reports for select
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy reports_update_admin on reports for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- book_edit_suggestions: same shape as book_suggestions — sender sees their
-- own, admins see and triage all.
create policy book_edit_suggestions_insert_self on book_edit_suggestions for insert
  to authenticated with check (user_id = auth.uid());
create policy book_edit_suggestions_select on book_edit_suggestions for select
  to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy book_edit_suggestions_update_admin on book_edit_suggestions for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- feed_likes/feed_comments: owner can write/delete their own row; deliberately
-- no select policy (see table comments above) — reads only happen inside
-- get_feed()/get_feed_comments() below.
create policy feed_likes_owner_insert on feed_likes for insert
  to authenticated with check (user_id = auth.uid());
create policy feed_likes_owner_delete on feed_likes for delete
  to authenticated using (user_id = auth.uid());
create policy feed_comments_owner_insert on feed_comments for insert
  to authenticated with check (user_id = auth.uid());
create policy feed_comments_owner_delete on feed_comments for delete
  to authenticated using (user_id = auth.uid());

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

create function get_feed()
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
     or af.user_id in (
       select case when f.requester_id = auth.uid() then f.receiver_id else f.requester_id end
       from friendships f
       where f.status = 'accepted'
         and (f.requester_id = auth.uid() or f.receiver_id = auth.uid())
     )
  order by af.created_at desc
  limit 50;
$$;

-- Backs toggle_feed_like/add_feed_comment/get_feed_comments below: a post is
-- only actionable by the same audience get_feed()'s union already grants
-- read access to (the author, or an accepted friend of theirs).
create or replace function is_feed_visible(p_feed_id uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from activity_feed af
    where af.id = p_feed_id
      and (
        af.user_id = auth.uid()
        or af.user_id in (
          select case when f.requester_id = auth.uid() then f.receiver_id else f.requester_id end
          from friendships f
          where f.status = 'accepted'
            and (f.requester_id = auth.uid() or f.receiver_id = auth.uid())
        )
      )
  );
$$;

create or replace function toggle_feed_like(p_feed_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  now_liked boolean;
begin
  if not is_feed_visible(p_feed_id) then
    raise exception 'Post introuvable';
  end if;
  if exists (select 1 from feed_likes where feed_id = p_feed_id and user_id = auth.uid()) then
    delete from feed_likes where feed_id = p_feed_id and user_id = auth.uid();
    now_liked := false;
  else
    insert into feed_likes (feed_id, user_id) values (p_feed_id, auth.uid());
    now_liked := true;
  end if;
  return now_liked;
end;
$$;

create or replace function add_feed_comment(p_feed_id uuid, p_comment text)
returns table (id uuid, user_id uuid, username text, avatar_url text, comment text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not is_feed_visible(p_feed_id) then
    raise exception 'Post introuvable';
  end if;
  if trim(p_comment) = '' then
    raise exception 'Commentaire vide';
  end if;
  insert into feed_comments (feed_id, user_id, comment) values (p_feed_id, auth.uid(), trim(p_comment))
  returning feed_comments.id into new_id;
  return query
    select fc.id, fc.user_id, p.username, p.avatar_url, fc.comment, fc.created_at
    from feed_comments fc join profiles p on p.id = fc.user_id
    where fc.id = new_id;
end;
$$;

create or replace function get_feed_comments(p_feed_id uuid)
returns table (id uuid, user_id uuid, username text, avatar_url text, comment text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select fc.id, fc.user_id, p.username, p.avatar_url, fc.comment, fc.created_at
  from feed_comments fc
  join profiles p on p.id = fc.user_id
  where fc.feed_id = p_feed_id and is_feed_visible(p_feed_id)
  order by fc.created_at asc;
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

-- Everything app/friends/[id].tsx shows for a friend: counts, currently-
-- reading, their current-year goal, format split, total reading time, and
-- every book they've finished (with rating/comment if they left one) — each
-- carries the book's id so the viewer can tap through to add it to their own
-- list. Mirrors what goal_progress()/
-- format_stats()/reading_time_stats() compute for the *caller's own* data
-- (those stay security invoker / auth.uid()-scoped); this is the security
-- definer path for viewing someone else's.
create or replace function friend_profile(p_user_id uuid)
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

-- external_id travels along so the client can treat a popular result exactly
-- like a search result (see books.getPopular()) — without it, adding a
-- popular book to your list tried to upsert a brand-new `books` row with a
-- null external_id instead of recognizing the one that already exists.
create or replace function popular_books()
returns table (
  book_id uuid, external_id varchar, title varchar, author varchar, cover_url text, description text,
  genres text[], published_year int, add_count bigint
)
language sql security definer set search_path = public stable as $$
  select b.id, b.external_id, b.title, b.author, b.cover_url, b.description, b.genres, b.published_year, count(ub.id)
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

-- Community rating average + individual reviews for the book detail screen
-- (lib/userBooks.ts) — reads every finished reader's rating/comment for a
-- book, not just the caller's own, so this needs security definer like
-- friend_profile()/popular_books() above.
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

-- Backs the stats page (app/stats.tsx, lib/stats.ts).
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

-- Backs the badges page (app/badges.tsx, lib/badges.ts) — badges themselves
-- aren't stored anywhere (no "earned badges" table); every tier is just
-- recomputed live from these counts each time the page loads, so there's
-- nothing to backfill/keep in sync if a badge's thresholds ever change.
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

-- ============================================================================
-- One-time data: promote the dev/owner account to admin so there's someone
-- who can triage book_suggestions/admin_messages and add books manually
-- through app/admin.tsx. No-op if that account doesn't exist yet.
-- ============================================================================
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'clervie@bluedays.com');
