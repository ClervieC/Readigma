-- Fills three gaps found after building out shared readings: no way to
-- delete/edit a message or the reading itself, and no moderation path.

-- Author can remove their own message (creator-side reading/member
-- deletion already existed via shared_readings_delete/
-- shared_reading_members_delete_creator, added in earlier migrations).
create policy shared_reading_messages_delete_own on shared_reading_messages for delete
  to authenticated using (user_id = auth.uid());

-- Needed so an admin reviewing a report on a message can actually read it —
-- the existing shared_reading_messages_select_own policy deliberately only
-- exposes a reader's own rows (see 038_shared_readings.sql), same reasoning
-- as profiles_update_admin combining via OR with profiles_update_self.
create policy shared_reading_messages_select_admin on shared_reading_messages for select
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Reusing the existing generic report flow (app/report.tsx, lib/reports.ts)
-- instead of a separate moderation system for shared readings specifically.
-- The column was sized for 'book'/'user' only.
alter table reports alter column target_type type varchar(30);
alter table reports drop constraint reports_target_type_check;
alter table reports add constraint reports_target_type_check
  check (target_type in ('book', 'user', 'shared_reading_message'));
