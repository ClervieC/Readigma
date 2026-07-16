-- Lets a user report a book or another user (app/report.tsx), and propose
-- an edit to an existing book's info — e.g. filling in a missing summary or
-- genre (app/edit-book-suggestion.tsx) — for an admin to review, same
-- approve/reject pattern as book_suggestions. Run once in the Supabase SQL
-- editor.

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

alter table reports enable row level security;

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

create table book_edit_suggestions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  book_id         uuid not null references books(id) on delete cascade,
  description     text,
  genres          text[],
  cover_url       text,
  published_year  int,
  series          varchar(500),
  series_index    numeric(5,2),
  status          varchar(20) not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at      timestamptz not null default now()
);

alter table book_edit_suggestions enable row level security;

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
