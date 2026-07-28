-- "Avant un chapitre: faire des prédictions. Quand on termine le livre: voir
-- qui avait raison." Unlike messages/reactions, a theory can't be gated by
-- percent_threshold — it's a prediction *about* something that hasn't
-- happened yet, so there's no known point to compare a reader's progress
-- against. Instead: a theory is private to its author until *they* resolve
-- it (self-reports right/wrong once the book reveals the answer), at which
-- point it's visible to every member — plain RLS handles this with no RPC
-- needed, since "mine, or resolved" doesn't depend on any other reader's
-- own progress.
create table shared_reading_theories (
  id                uuid primary key default gen_random_uuid(),
  shared_reading_id uuid not null references shared_readings(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  content           text not null,
  is_correct        boolean,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

alter table shared_reading_theories enable row level security;

create policy shared_reading_theories_select on shared_reading_theories for select
  to authenticated using (
    user_id = auth.uid()
    or (
      is_correct is not null
      and exists (
        select 1 from shared_reading_members m
        where m.shared_reading_id = shared_reading_theories.shared_reading_id and m.user_id = auth.uid()
      )
    )
  );
create policy shared_reading_theories_insert on shared_reading_theories for insert
  to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_theories.shared_reading_id and m.user_id = auth.uid()
    )
  );
create policy shared_reading_theories_update_own on shared_reading_theories for update
  to authenticated using (user_id = auth.uid());
