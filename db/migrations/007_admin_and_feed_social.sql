-- Admin inbox (contact form) + book suggestions were already partially in
-- place (book_suggestions); this adds a real "write to the admin" channel,
-- promotes the dev account to admin, and adds likes/comments on feed posts.
-- Run once in the Supabase SQL editor.

create table if not exists admin_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  message     text not null,
  status      varchar(20) not null default 'unread', -- 'unread' | 'read'
  created_at  timestamptz not null default now()
);

alter table admin_messages enable row level security;

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

-- Promote the dev/owner account to admin. Adjust the email if this app's
-- primary account differs.
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'clervie@bluedays.com');

-- ============================================================================
-- Feed likes + comments
-- ============================================================================
-- Visibility (who can like/comment/read on a given post) is enforced the
-- same way get_feed()'s friend-union already is: through security definer
-- functions, not raw table RLS — these tables carry no select policy at all,
-- so direct client reads are impossible; everything goes through the RPCs
-- below, matching the pattern documented above the RLS section in schema.sql.

create table if not exists feed_likes (
  id          uuid primary key default gen_random_uuid(),
  feed_id     uuid not null references activity_feed(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (feed_id, user_id)
);

create table if not exists feed_comments (
  id          uuid primary key default gen_random_uuid(),
  feed_id     uuid not null references activity_feed(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  comment     text not null,
  created_at  timestamptz not null default now()
);

alter table feed_likes enable row level security;
alter table feed_comments enable row level security;

create policy feed_likes_owner_insert on feed_likes for insert
  to authenticated with check (user_id = auth.uid());
create policy feed_likes_owner_delete on feed_likes for delete
  to authenticated using (user_id = auth.uid());

create policy feed_comments_owner_insert on feed_comments for insert
  to authenticated with check (user_id = auth.uid());
create policy feed_comments_owner_delete on feed_comments for delete
  to authenticated using (user_id = auth.uid());

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

-- get_feed()'s return shape is changing (three new columns), and Postgres
-- won't let CREATE OR REPLACE change a function's return type.
drop function if exists get_feed();

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
