-- BookToker creator space (scoped down): no actual video/audio streaming
-- (that needs a third-party service like Mux/Agora, well outside what this
-- Supabase-backed app can do on its own) — "live" here means a text Q&A
-- window the creator opens/closes, signaled by is_live. Quiz is a real
-- scored multiple-choice question, distinct from shared_reading_book_votes
-- (which is a plain popularity poll, not right/wrong).
alter table shared_readings add column is_live boolean not null default false;

create table shared_reading_quizzes (
  id                uuid primary key default gen_random_uuid(),
  shared_reading_id uuid not null references shared_readings(id) on delete cascade,
  created_by        uuid not null references profiles(id) on delete cascade,
  question          text not null,
  options           text[] not null,
  correct_option    int not null,
  created_at        timestamptz not null default now()
);

create table shared_reading_quiz_answers (
  id               uuid primary key default gen_random_uuid(),
  quiz_id          uuid not null references shared_reading_quizzes(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  selected_option  int not null,
  created_at       timestamptz not null default now(),
  unique (quiz_id, user_id)
);

alter table shared_reading_quizzes enable row level security;
alter table shared_reading_quiz_answers enable row level security;

create policy shared_reading_quizzes_select on shared_reading_quizzes for select
  to authenticated using (
    exists (
      select 1 from shared_reading_members m
      where m.shared_reading_id = shared_reading_quizzes.shared_reading_id and m.user_id = auth.uid()
    )
  );
-- Only the reading's creator can post a quiz — this is explicitly the
-- "BookToker creator" side of the feature, not a member-to-member thing
-- like theories/votes.
create policy shared_reading_quizzes_insert on shared_reading_quizzes for insert
  to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from shared_readings r where r.id = shared_reading_id and r.creator_id = auth.uid()
    )
  );

create policy shared_reading_quiz_answers_select_own on shared_reading_quiz_answers for select
  to authenticated using (user_id = auth.uid());
create policy shared_reading_quiz_answers_insert on shared_reading_quiz_answers for insert
  to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from shared_reading_quizzes q
      join shared_reading_members m on m.shared_reading_id = q.shared_reading_id and m.user_id = auth.uid()
      where q.id = quiz_id
    )
  );

-- Aggregate result (% who picked each option) — only meaningful once the
-- caller has answered, otherwise it'd let someone peek at the right answer
-- before committing to one.
create or replace function get_shared_reading_quiz_results(p_quiz_id uuid)
returns table(selected_option int, count bigint, is_correct boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_correct int;
begin
  if not exists (
    select 1 from shared_reading_quiz_answers where quiz_id = p_quiz_id and user_id = auth.uid()
  ) then
    raise exception 'Réponds d''abord pour voir les résultats';
  end if;

  select correct_option into v_correct from shared_reading_quizzes where id = p_quiz_id;

  return query
    select a.selected_option, count(*), a.selected_option = v_correct
    from shared_reading_quiz_answers a
    where a.quiz_id = p_quiz_id
    group by a.selected_option;
end;
$$;
