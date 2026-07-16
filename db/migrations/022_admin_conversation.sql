-- Replaces the old one-shot admin_messages (single message + single reply)
-- with a real back-and-forth thread: every message either side sends is its
-- own row, ordered by created_at, so "Contacter l'équipe" (app/contact.tsx)
-- can render an actual conversation instead of a single message/response
-- pair. admin_messages itself is left in place (old data, not read by new
-- code) rather than dropped. Run once in the Supabase SQL editor.

create table admin_thread_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade, -- whose thread this belongs to
  sender      varchar(10) not null check (sender in ('user', 'admin')),
  body        text not null,
  created_at  timestamptz not null default now()
);

alter table admin_thread_messages enable row level security;

-- A user can only post into their own thread as 'user'; an admin can post
-- into anyone's thread as 'admin'.
create policy admin_thread_messages_insert on admin_thread_messages for insert
  to authenticated with check (
    (sender = 'user' and user_id = auth.uid())
    or (sender = 'admin' and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  );

-- A user sees only their own thread; an admin sees every thread.
create policy admin_thread_messages_select on admin_thread_messages for select
  to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
