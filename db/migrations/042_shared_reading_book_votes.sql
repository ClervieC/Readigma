-- "Avant la prochaine lecture: chaque membre propose un livre. Vote intégré.
-- Classement en direct." Attached to an existing shared_readings row (its
-- members propose/vote on what to read next) rather than a standalone
-- "book club" entity — there's no persistent group beyond one reading yet,
-- see the shared-readings planning discussion.
create table shared_reading_book_proposals (
  id                uuid primary key default gen_random_uuid(),
  shared_reading_id uuid not null references shared_readings(id) on delete cascade,
  book_id           uuid not null references books(id) on delete cascade,
  proposed_by       uuid not null references profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (shared_reading_id, book_id)
);

-- shared_reading_id is denormalized here (rather than joined through
-- proposal_id) purely so "one active vote per reading" can be a plain
-- unique constraint — switching your vote is a delete+insert (or upsert on
-- this same key) instead of needing to look up which proposal you'd
-- previously picked.
create table shared_reading_book_votes (
  id                uuid primary key default gen_random_uuid(),
  proposal_id       uuid not null references shared_reading_book_proposals(id) on delete cascade,
  shared_reading_id uuid not null references shared_readings(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (shared_reading_id, user_id)
);

alter table shared_reading_book_proposals enable row level security;
alter table shared_reading_book_votes enable row level security;

create policy shared_reading_book_proposals_select on shared_reading_book_proposals for select
  to authenticated using (
    exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_book_proposals.shared_reading_id and m.user_id = auth.uid()
    )
  );
create policy shared_reading_book_proposals_insert on shared_reading_book_proposals for insert
  to authenticated with check (
    proposed_by = auth.uid()
    and exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_book_proposals.shared_reading_id and m.user_id = auth.uid()
    )
  );

create policy shared_reading_book_votes_select on shared_reading_book_votes for select
  to authenticated using (
    exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_book_votes.shared_reading_id and m.user_id = auth.uid()
    )
  );
create policy shared_reading_book_votes_insert on shared_reading_book_votes for insert
  to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_book_votes.shared_reading_id and m.user_id = auth.uid()
    )
  );
create policy shared_reading_book_votes_delete_own on shared_reading_book_votes for delete
  to authenticated using (user_id = auth.uid());

-- Live ranking with vote counts + whether the caller voted for each —
-- plain aggregation, no percent gating involved here, but kept as an RPC
-- (rather than two client round-trips) for one consistent snapshot.
-- security definer bypasses the RLS above entirely, so the membership
-- check has to be repeated here explicitly (same pattern as
-- get_shared_reading_roster) — otherwise anyone could pass an arbitrary
-- reading id and read proposals/votes for a reading they're not part of.
create or replace function get_shared_reading_proposals(p_reading_id uuid)
returns table(
  proposal_id uuid, book_id uuid, title varchar, author varchar, cover_url text,
  proposed_by uuid, proposed_by_username varchar, vote_count bigint, voted_by_me boolean
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from shared_reading_members m
    where m.shared_reading_id = p_reading_id and m.user_id = auth.uid()
  ) then
    raise exception 'Accès refusé';
  end if;

  return query
    select
      p.id, b.id, b.title, b.author, b.cover_url,
      p.proposed_by, pr.username,
      count(v.id),
      bool_or(v.user_id = auth.uid())
    from shared_reading_book_proposals p
    join books b on b.id = p.book_id
    join profiles pr on pr.id = p.proposed_by
    left join shared_reading_book_votes v on v.proposal_id = p.id
    where p.shared_reading_id = p_reading_id
    group by p.id, b.id, b.title, b.author, b.cover_url, p.proposed_by, pr.username
    order by count(v.id) desc, p.created_at asc;
end;
$$;
