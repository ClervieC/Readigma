-- Onboarding completion used to live only in device AsyncStorage, so it
-- replayed on every login from a new device/browser (or after clearing site
-- data) even though the account had already seen it. Moving it onto the
-- profile row makes it a true once-per-account flag. Run once in the
-- Supabase SQL editor.

alter table profiles add column if not exists onboarding_done boolean not null default false;
