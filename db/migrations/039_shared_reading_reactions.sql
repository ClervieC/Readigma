-- Chapter-less equivalent of "82% of readers reacted 🤯 at chapter 18" —
-- reactions are bucketed into 5-point percent buckets (rather than exact
-- percent, which would almost never match between two readers and make
-- aggregation pointless) and, like shared_reading_messages, only ever
-- surfaced for buckets at or below the viewer's own progress. Aggregates
-- only (counts), never who reacted what, so a spike itself can't leak
-- "something happens here" beyond what the reader has already reached.
create table shared_reading_reactions (
  id                uuid primary key default gen_random_uuid(),
  shared_reading_id uuid not null references shared_readings(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  percent_bucket    int not null check (percent_bucket >= 0 and percent_bucket <= 100),
  emoji             text not null,
  created_at        timestamptz not null default now(),
  -- One reaction per user per bucket — reacting again at the same point
  -- changes the emoji instead of stacking a second row (see
  -- lib/sharedReadings.ts's react(), an upsert on this constraint.
  unique (shared_reading_id, user_id, percent_bucket)
);

alter table shared_reading_reactions enable row level security;

-- Same split as shared_reading_messages: the raw table only exposes a
-- reader's own reactions, the aggregate/gated read path is the RPC below.
create policy shared_reading_reactions_select_own on shared_reading_reactions for select
  to authenticated using (user_id = auth.uid());
create policy shared_reading_reactions_insert on shared_reading_reactions for insert
  to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_reactions.shared_reading_id and m.user_id = auth.uid()
    )
  );
create policy shared_reading_reactions_update_own on shared_reading_reactions for update
  to authenticated using (user_id = auth.uid());

create or replace function get_shared_reading_reaction_stats(p_reading_id uuid)
returns table(percent_bucket int, emoji text, count bigint)
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
    select r.percent_bucket, r.emoji, count(*)
    from shared_reading_reactions r
    where r.shared_reading_id = p_reading_id
      and r.percent_bucket <= v_my_percent
    group by r.percent_bucket, r.emoji
    order by r.percent_bucket asc;
end;
$$;
