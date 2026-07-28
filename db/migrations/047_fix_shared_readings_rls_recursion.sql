-- shared_readings_select referenced shared_reading_members directly in a
-- correlated subquery, and shared_reading_members_select referenced
-- shared_readings right back — each SELECT re-triggered the other table's
-- RLS policy, which re-triggered the first again, forever ("infinite
-- recursion detected in policy for relation shared_readings", 42P17).
-- Routing the membership check through a security definer function (same
-- RLS-bypass technique the get_shared_reading_* functions already rely on
-- for cross-user reads, e.g. get_feed()) breaks the cycle: the function
-- runs as its owner and never re-enters shared_reading_members' own policy.
create or replace function is_shared_reading_member(p_reading_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from shared_reading_members m
    where m.shared_reading_id = p_reading_id and m.user_id = auth.uid()
  );
$$;

drop policy if exists shared_readings_select on shared_readings;
create policy shared_readings_select on shared_readings for select
  to authenticated using (
    is_public
    or creator_id = auth.uid()
    or is_shared_reading_member(id)
  );
