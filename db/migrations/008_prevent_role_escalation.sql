-- Closes a privilege-escalation gap: profiles_update_self only checks
-- `id = auth.uid()`, with no column restriction, so any signed-in user could
-- currently PATCH their own row with {"role":"admin"} and self-promote.
-- This trigger reverts any client-initiated role change unless the caller
-- is already an admin. auth.uid() is null for the service_role key and for
-- a direct SQL editor/superuser session (both already trusted), so only
-- real end-user sessions are constrained. Run once in the Supabase SQL editor.

create or replace function prevent_role_self_escalation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    ) then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on profiles;
create trigger trg_prevent_role_self_escalation
  before update on profiles
  for each row execute function prevent_role_self_escalation();
