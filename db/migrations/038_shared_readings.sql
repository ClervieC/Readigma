-- Shared readings (MVP): a group reads the same book together, with a
-- discussion feed gated by each reader's own progress — the anti-spoiler
-- mechanic that's the actual point of this feature. Progress reuses
-- user_books.progress_percent (already maintained for every book/user pair
-- regardless of pages/percent tracking mode), so there's no separate
-- progress system to keep in sync.
--
-- Deliberately out of scope for this first pass: imposed reading schedules,
-- live "chapter is on fire" stats, creator analytics, votes, gamification —
-- see the shared-readings planning discussion. Chapter/page granularity is
-- also collapsed to a single percent_threshold per message rather than
-- tracked separately, since `books` has no reliable chapter-count field to
-- convert page/chapter into a comparable position across editions anyway.

create table shared_readings (
  id               uuid primary key default gen_random_uuid(),
  book_id          uuid not null references books(id) on delete cascade,
  creator_id       uuid not null references profiles(id) on delete cascade,
  is_public        boolean not null default true,
  max_participants int,
  starts_at        date,
  ends_at          date,
  created_at       timestamptz not null default now()
);

create table shared_reading_members (
  id                uuid primary key default gen_random_uuid(),
  shared_reading_id uuid not null references shared_readings(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  joined_at         timestamptz not null default now(),
  unique (shared_reading_id, user_id)
);

-- percent_threshold is the point in the book this message is *about* — set
-- by the poster (defaults to their own current progress client-side), and
-- what get_shared_reading_messages() below compares a reader's own progress
-- against to decide whether they're allowed to see it yet.
create table shared_reading_messages (
  id                uuid primary key default gen_random_uuid(),
  shared_reading_id uuid not null references shared_readings(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  content           text not null,
  percent_threshold numeric(5,2) not null default 0,
  created_at        timestamptz not null default now()
);

-- The creator is a member from the start (so they show up in the roster and
-- can post messages like anyone else) without the client needing a second
-- request that could fail/race separately from the create call.
create or replace function add_shared_reading_creator_as_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into shared_reading_members (shared_reading_id, user_id) values (new.id, new.creator_id);
  return new;
end;
$$;

create trigger shared_readings_add_creator
  after insert on shared_readings
  for each row execute function add_shared_reading_creator_as_member();

-- Enforced here rather than relying on the client to check first — an
-- insert racing another one right at the capacity boundary would otherwise
-- let both through. NULL max_participants means uncapped.
create or replace function check_shared_reading_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_max int;
  v_count int;
begin
  select max_participants into v_max from shared_readings where id = new.shared_reading_id;
  if v_max is not null then
    select count(*) into v_count from shared_reading_members where shared_reading_id = new.shared_reading_id;
    if v_count >= v_max then
      raise exception 'Cette lecture commune est complète';
    end if;
  end if;
  return new;
end;
$$;

create trigger shared_reading_members_capacity
  before insert on shared_reading_members
  for each row execute function check_shared_reading_capacity();

alter table shared_readings enable row level security;
alter table shared_reading_members enable row level security;
alter table shared_reading_messages enable row level security;

-- shared_readings: visible if public, or to the creator, or to anyone
-- already a member (covers private readings the creator added someone to).
create policy shared_readings_select on shared_readings for select
  to authenticated using (
    is_public
    or creator_id = auth.uid()
    or exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_readings.id and m.user_id = auth.uid()
    )
  );
create policy shared_readings_insert on shared_readings for insert
  to authenticated with check (creator_id = auth.uid());
create policy shared_readings_update on shared_readings for update
  to authenticated using (creator_id = auth.uid());
create policy shared_readings_delete on shared_readings for delete
  to authenticated using (creator_id = auth.uid());

-- shared_reading_members: two separate insert policies (self-join a public
-- reading, or the creator adding someone to their own reading) combine via
-- OR, same pattern as profiles_update_self/profiles_update_admin above.
create policy shared_reading_members_select on shared_reading_members for select
  to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from shared_readings r
      where r.id = shared_reading_members.shared_reading_id
        and (r.is_public or r.creator_id = auth.uid())
    )
  );
create policy shared_reading_members_insert_self on shared_reading_members for insert
  to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from shared_readings r where r.id = shared_reading_id and r.is_public)
  );
create policy shared_reading_members_insert_creator on shared_reading_members for insert
  to authenticated with check (
    exists (select 1 from shared_readings r where r.id = shared_reading_id and r.creator_id = auth.uid())
  );
create policy shared_reading_members_delete_self on shared_reading_members for delete
  to authenticated using (user_id = auth.uid());
create policy shared_reading_members_delete_creator on shared_reading_members for delete
  to authenticated using (
    exists (select 1 from shared_readings r where r.id = shared_reading_id and r.creator_id = auth.uid())
  );

-- shared_reading_messages: the table itself only exposes a reader's own
-- posts (mirrors activity_feed_owner_select) — cross-member visibility with
-- the percent gate applied lives entirely in get_shared_reading_messages()
-- below, a security definer function, same division of labor as get_feed().
create policy shared_reading_messages_select_own on shared_reading_messages for select
  to authenticated using (user_id = auth.uid());
create policy shared_reading_messages_insert on shared_reading_messages for insert
  to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_messages.shared_reading_id and m.user_id = auth.uid()
    )
  );

-- Member roster with each person's live progress on the reading's book —
-- guards its own access instead of relying on shared_reading_members' RLS,
-- since this also needs to read *other* members' rows.
create or replace function get_shared_reading_roster(p_reading_id uuid)
returns table(user_id uuid, username varchar, avatar_url text, progress_percent numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_book_id uuid;
begin
  if not exists (
    select 1 from shared_readings r
    left join shared_reading_members m on m.shared_reading_id = r.id and m.user_id = auth.uid()
    where r.id = p_reading_id and (r.is_public or r.creator_id = auth.uid() or m.user_id is not null)
  ) then
    raise exception 'Accès refusé';
  end if;

  select book_id into v_book_id from shared_readings where id = p_reading_id;

  return query
    select p.id, p.username, p.avatar_url, coalesce(ub.progress_percent, 0)
    from shared_reading_members srm
    join profiles p on p.id = srm.user_id
    left join user_books ub on ub.user_id = srm.user_id and ub.book_id = v_book_id
    where srm.shared_reading_id = p_reading_id
    order by coalesce(ub.progress_percent, 0) desc;
end;
$$;

-- The anti-spoiler read path: only returns messages at or before the
-- caller's own progress on this reading's book.
create or replace function get_shared_reading_messages(p_reading_id uuid)
returns table(id uuid, user_id uuid, username varchar, avatar_url text, content text, percent_threshold numeric, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_book_id uuid;
  v_my_percent numeric;
begin
  select book_id into v_book_id from shared_readings where id = p_reading_id;
  select coalesce(progress_percent, 0) into v_my_percent
    from user_books where user_id = auth.uid() and book_id = v_book_id;
  v_my_percent := coalesce(v_my_percent, 0);

  return query
    select m.id, m.user_id, p.username, p.avatar_url, m.content, m.percent_threshold, m.created_at
    from shared_reading_messages m
    join profiles p on p.id = m.user_id
    where m.shared_reading_id = p_reading_id
      and m.percent_threshold <= v_my_percent
    order by m.percent_threshold asc, m.created_at asc;
end;
$$;
