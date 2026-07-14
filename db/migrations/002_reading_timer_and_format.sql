-- Adds the reading timer + physical/e-reader format feature to an existing
-- Readigma database. Safe to run more than once (every statement is
-- idempotent) — unlike pasting the whole db/schema.sql again, which fails
-- immediately on "relation already exists" for tables you already have.

alter table user_books add column if not exists format varchar(20); -- 'physical' | 'ereader'

create table if not exists reading_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int
);

create or replace function reading_sessions_before_write() returns trigger language plpgsql as $$
begin
  if new.ended_at is not null then
    new.duration_seconds = greatest(0, extract(epoch from (new.ended_at - new.started_at))::int);
  end if;
  return new;
end;
$$;

drop trigger if exists reading_sessions_before_write on reading_sessions;
create trigger reading_sessions_before_write
  before insert or update on reading_sessions
  for each row execute function reading_sessions_before_write();

alter table reading_sessions enable row level security;

drop policy if exists reading_sessions_owner on reading_sessions;
create policy reading_sessions_owner on reading_sessions for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function book_reading_time(p_book_id uuid)
returns bigint
language sql security invoker stable as $$
  select coalesce(sum(duration_seconds), 0)
  from reading_sessions
  where user_id = auth.uid() and book_id = p_book_id and duration_seconds is not null;
$$;

create or replace function reading_time_stats()
returns table (total_seconds bigint, month_seconds bigint)
language sql security invoker stable as $$
  select
    coalesce(sum(duration_seconds), 0),
    coalesce(sum(duration_seconds) filter (where started_at >= date_trunc('month', now())), 0)
  from reading_sessions
  where user_id = auth.uid() and duration_seconds is not null;
$$;

create or replace function format_stats()
returns table (physical_count bigint, ereader_count bigint)
language sql security invoker stable as $$
  select
    count(*) filter (where format = 'physical'),
    count(*) filter (where format = 'ereader')
  from user_books
  where user_id = auth.uid();
$$;
