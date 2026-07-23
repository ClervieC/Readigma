-- Makes the schema self-contained instead of silently depending on Supabase
-- Cloud's own project-bootstrap grants, which a self-hosted instance may not
-- provision the same way. Every RPC in this file is either:
--   - security definer (get_user_profile, popular_books, search_users...):
--     runs as the function's owner, so it worked regardless of grants on the
--     underlying tables — this is why only SOME endpoints broke.
--   - security invoker (reading_time_stats, book_reading_time,
--     format_stats...): runs as the CALLING role (anon/authenticated), which
--     needs its own direct grant on the underlying table to even attempt the
--     query — Postgres returns a bare "permission denied" (403 via
--     PostgREST) before RLS is ever evaluated if that grant is missing.
--
-- Safe to run more than once. ALTER DEFAULT PRIVILEGES only affects objects
-- created *after* it runs, so it's included here too — any future migration
-- that adds a table/function is covered automatically, on any host.
--
-- On some self-hosted instances the `postgres` role is NOT a superuser
-- (rolsuper = false) and doesn't own schema `auth` (owned by
-- supabase_auth_admin there) — running this whole file as `postgres` then
-- silently no-ops the last GRANT below ("WARNING: no privileges were granted
-- for auth", nothing actually changes) instead of erroring loudly. If that
-- happens: find the real superuser (`select rolname from pg_roles where
-- rolsuper;` — usually `supabase_admin`) and re-run at least that last GRANT
-- as that role instead, e.g.
--   docker exec -it <db-container> psql -U supabase_admin -d postgres -c \
--     "grant usage on schema auth to anon, authenticated, service_role;"
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;

-- Almost every security-invoker function above also calls auth.uid() —
-- schema-qualified, into `auth`, not `public`. USAGE on schema `auth` is a
-- separate privilege from EXECUTE on auth.uid() itself: without it, Postgres
-- refuses to resolve anything in that schema for the calling role at all
-- ("permission denied for schema auth", 42501 → 403 via PostgREST), even
-- though EXECUTE on the function was granted. Supabase Cloud provisions this
-- for every project by default; it isn't guaranteed on a self-hosted stack.
grant usage on schema auth to anon, authenticated, service_role;
