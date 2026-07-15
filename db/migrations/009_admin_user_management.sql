-- Lets an admin ban/unban a user and promote/demote admin from a user list
-- (app/admin.tsx "Utilisateurs" tab). Run once in the Supabase SQL editor.

alter table profiles add column if not exists banned boolean not null default false;

-- profiles_update_self (existing) only lets someone update their own row —
-- an admin editing *another* user's role/banned needs its own policy. RLS
-- combines multiple permissive policies with OR, so this only widens which
-- rows an admin can target; prevent_role_self_escalation (extended below)
-- still gates what a non-admin caller is allowed to change.
drop policy if exists profiles_update_admin on profiles;
create policy profiles_update_admin on profiles for update
  to authenticated using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Extends the existing role-escalation guard to also cover `banned`: a
-- non-admin session must not be able to unban itself via a direct PATCH,
-- and (as before) must not be able to self-promote to admin. auth.uid() is
-- null for the service_role key / a direct SQL editor session — both
-- already-trusted contexts — so only real end-user sessions are constrained.
create or replace function prevent_role_self_escalation() returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_is_admin boolean;
begin
  if new.role is distinct from old.role or new.banned is distinct from old.banned then
    if auth.uid() is not null then
      select exists (select 1 from profiles where id = auth.uid() and role = 'admin') into caller_is_admin;
      if not caller_is_admin then
        new.role := old.role;
        new.banned := old.banned;
      end if;
    end if;
  end if;
  return new;
end;
$$;
