-- Lets an admin reply to a user's admin_messages entry (app/admin.tsx
-- "Messages" tab) instead of only marking it read. The reply is pushed to
-- the user via the existing notify() helper (lib/admin.ts), same pattern as
-- suggestion approve/reject. Run once in the Supabase SQL editor.

alter table admin_messages add column if not exists reply text;
alter table admin_messages add column if not exists replied_at timestamptz;
