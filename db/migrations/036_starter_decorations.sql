-- Gives every account at least 4 decoration credits from the start, instead
-- of an empty shelf until the first badge tier is earned — introduced in
-- onboarding (see app/onboarding.tsx) as the way new users learn the shelf
-- can be decorated at all. decorations_unlocked is a high-water mark (see
-- lib/badges.ts's syncDecorationUnlocks), so this only ever raises it, never
-- lowers an account that already earned more via badges. Safe to run more
-- than once.

alter table profiles alter column decorations_unlocked set default 4;

update profiles set decorations_unlocked = 4 where decorations_unlocked < 4;
