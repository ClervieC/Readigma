-- Decoration credits earned through badges (see lib/badges.ts,
-- syncDecorationUnlocks). A high-water mark, not a live recomputation like
-- badge tiers themselves: some badge stats (reading streak, "pile à lire"
-- count) can legitimately go back down, but a decoration the user already
-- earned — and may have already placed on their shelf — must never be taken
-- away, so this only ever ratchets upward.

alter table profiles
  add column if not exists decorations_unlocked int not null default 0;
