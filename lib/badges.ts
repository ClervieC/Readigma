import { supabase, getCurrentUserId } from './supabase';

export type BadgeStats = {
  done_count: number;
  to_read_count: number;
  reading_count: number;
  total_reading_seconds: number;
  streak_days: number;
  distinct_genres: number;
  distinct_authors_read: number;
};

export async function getBadgeStats(): Promise<BadgeStats> {
  const { data, error } = await supabase.rpc('badge_stats');
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return {
    done_count: row?.done_count ?? 0,
    to_read_count: row?.to_read_count ?? 0,
    reading_count: row?.reading_count ?? 0,
    total_reading_seconds: row?.total_reading_seconds ?? 0,
    streak_days: row?.streak_days ?? 0,
    distinct_genres: row?.distinct_genres ?? 0,
    distinct_authors_read: row?.distinct_authors_read ?? 0,
  };
}

export type BadgeCategory = {
  id: string;
  icon: string; // Feather icon name
  title: string;
  unit: string; // shown after the raw value, e.g. "livres", "heures"
  tiers: { threshold: number; label: string }[];
  // Pulls the raw stat value this category tracks out of BadgeStats, and
  // converts it into whatever unit the tiers are expressed in (reading time
  // is stored in seconds but tiers are in hours, everything else is 1:1).
  value: (s: BadgeStats) => number;
};

// title/unit/tier.label below are i18next keys (lib/locales/{fr,en}.json's
// "badges.categories.*"), not display strings — this is a plain data module
// with no useTranslation() of its own, so app/badges.tsx (the only consumer)
// resolves them with its own `t` at render time.
//
// No "earned badges" table — every tier is just a threshold on a live stat,
// so raising/lowering a threshold or adding a new tier later never needs a
// migration or backfill, unlike a stored-achievement model would.
export const BADGE_CATEGORIES: BadgeCategory[] = [
  {
    id: 'books_read',
    icon: 'book',
    title: 'badges.categories.books_read.title',
    unit: 'badges.categories.books_read.unit',
    value: (s) => s.done_count,
    tiers: [
      { threshold: 1, label: 'badges.categories.books_read.tiers.0' },
      { threshold: 5, label: 'badges.categories.books_read.tiers.1' },
      { threshold: 10, label: 'badges.categories.books_read.tiers.2' },
      { threshold: 25, label: 'badges.categories.books_read.tiers.3' },
      { threshold: 50, label: 'badges.categories.books_read.tiers.4' },
      { threshold: 100, label: 'badges.categories.books_read.tiers.5' },
      { threshold: 200, label: 'badges.categories.books_read.tiers.6' },
    ],
  },
  {
    id: 'to_read',
    icon: 'bookmark',
    title: 'badges.categories.to_read.title',
    unit: 'badges.categories.to_read.unit',
    value: (s) => s.to_read_count,
    tiers: [
      { threshold: 5, label: 'badges.categories.to_read.tiers.0' },
      { threshold: 10, label: 'badges.categories.to_read.tiers.1' },
      { threshold: 25, label: 'badges.categories.to_read.tiers.2' },
      { threshold: 50, label: 'badges.categories.to_read.tiers.3' },
      { threshold: 100, label: 'badges.categories.to_read.tiers.4' },
    ],
  },
  {
    id: 'reading_time',
    icon: 'clock',
    title: 'badges.categories.reading_time.title',
    unit: 'badges.categories.reading_time.unit',
    value: (s) => Math.floor(s.total_reading_seconds / 3600),
    tiers: [
      { threshold: 1, label: 'badges.categories.reading_time.tiers.0' },
      { threshold: 5, label: 'badges.categories.reading_time.tiers.1' },
      { threshold: 10, label: 'badges.categories.reading_time.tiers.2' },
      { threshold: 25, label: 'badges.categories.reading_time.tiers.3' },
      { threshold: 50, label: 'badges.categories.reading_time.tiers.4' },
      { threshold: 100, label: 'badges.categories.reading_time.tiers.5' },
    ],
  },
  {
    id: 'streak',
    icon: 'zap',
    title: 'badges.categories.streak.title',
    unit: 'badges.categories.streak.unit',
    value: (s) => s.streak_days,
    tiers: [
      { threshold: 3, label: 'badges.categories.streak.tiers.0' },
      { threshold: 7, label: 'badges.categories.streak.tiers.1' },
      { threshold: 14, label: 'badges.categories.streak.tiers.2' },
      { threshold: 30, label: 'badges.categories.streak.tiers.3' },
      { threshold: 60, label: 'badges.categories.streak.tiers.4' },
    ],
  },
  {
    id: 'genres',
    icon: 'compass',
    title: 'badges.categories.genres.title',
    unit: 'badges.categories.genres.unit',
    value: (s) => s.distinct_genres,
    tiers: [
      { threshold: 3, label: 'badges.categories.genres.tiers.0' },
      { threshold: 5, label: 'badges.categories.genres.tiers.1' },
      { threshold: 10, label: 'badges.categories.genres.tiers.2' },
      { threshold: 15, label: 'badges.categories.genres.tiers.3' },
    ],
  },
  {
    id: 'authors',
    icon: 'users',
    title: 'badges.categories.authors.title',
    unit: 'badges.categories.authors.unit',
    value: (s) => s.distinct_authors_read,
    tiers: [
      { threshold: 3, label: 'badges.categories.authors.tiers.0' },
      { threshold: 5, label: 'badges.categories.authors.tiers.1' },
      { threshold: 10, label: 'badges.categories.authors.tiers.2' },
      { threshold: 20, label: 'badges.categories.authors.tiers.3' },
    ],
  },
];

export type BadgeProgress = {
  category: BadgeCategory;
  value: number;
  earnedTierIndex: number; // -1 = no tier earned yet
  nextTier: { threshold: number; label: string } | null;
  progressToNext: number; // 0..1
};

export function computeBadgeProgress(stats: BadgeStats): BadgeProgress[] {
  return BADGE_CATEGORIES.map((category) => {
    const value = category.value(stats);
    let earnedTierIndex = -1;
    for (let i = 0; i < category.tiers.length; i++) {
      if (value >= category.tiers[i].threshold) earnedTierIndex = i;
    }
    const nextTier = category.tiers[earnedTierIndex + 1] ?? null;
    const prevThreshold = earnedTierIndex >= 0 ? category.tiers[earnedTierIndex].threshold : 0;
    const progressToNext = nextTier
      ? Math.min(1, Math.max(0, (value - prevThreshold) / (nextTier.threshold - prevThreshold)))
      : 1;
    return { category, value, earnedTierIndex, nextTier, progressToNext };
  });
}

// Every individual badge tier reached (not just one per category) unlocks
// one shelf decoration credit — so going from "Petit lecteur" to "Lecteur
// régulier" earns a second one, not just the first tier in that category.
export function countEarnedTiers(progress: BadgeProgress[]): number {
  return progress.reduce((sum, p) => sum + (p.earnedTierIndex + 1), 0);
}

// Ratchets profiles.decorations_unlocked up to the number of badge tiers
// currently earned, never down — some of the underlying stats (reading
// streak, "pile à lire" count) can legitimately decrease, but a decoration
// the user already unlocked (and may have already placed on their shelf)
// must never be revoked. Call this whenever the library screen loads;
// returns the resulting (possibly unchanged) unlocked count.
export async function syncDecorationUnlocks(): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) return 0;
  const [stats, { data: profileRow, error: profileError }] = await Promise.all([
    getBadgeStats(),
    supabase.from('profiles').select('decorations_unlocked').eq('id', userId).single(),
  ]);
  if (profileError) throw new Error(profileError.message);
  const current = profileRow?.decorations_unlocked ?? 0;
  const earned = countEarnedTiers(computeBadgeProgress(stats));
  if (earned <= current) return current;
  const { error } = await supabase
    .from('profiles')
    .update({ decorations_unlocked: earned })
    .eq('id', userId);
  if (error) throw new Error(error.message);
  return earned;
}
