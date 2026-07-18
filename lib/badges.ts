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

// No "earned badges" table — every tier is just a threshold on a live stat,
// so raising/lowering a threshold or adding a new tier later never needs a
// migration or backfill, unlike a stored-achievement model would.
export const BADGE_CATEGORIES: BadgeCategory[] = [
  {
    id: 'books_read',
    icon: 'book',
    title: 'Livres lus',
    unit: 'livres',
    value: (s) => s.done_count,
    tiers: [
      { threshold: 1, label: 'Premier livre' },
      { threshold: 5, label: 'Petit lecteur' },
      { threshold: 10, label: 'Lecteur régulier' },
      { threshold: 25, label: 'Bibliophile' },
      { threshold: 50, label: 'Dévoreur de livres' },
      { threshold: 100, label: 'Rat de bibliothèque' },
      { threshold: 200, label: 'Légende de la lecture' },
    ],
  },
  {
    id: 'to_read',
    icon: 'bookmark',
    title: 'Pile à lire',
    unit: 'livres',
    value: (s) => s.to_read_count,
    tiers: [
      { threshold: 5, label: 'Petite pile' },
      { threshold: 10, label: 'Collectionneur' },
      { threshold: 25, label: 'Grande ambition' },
      { threshold: 50, label: 'Pile vertigineuse' },
      { threshold: 100, label: "On n'est plus à ça près" },
    ],
  },
  {
    id: 'reading_time',
    icon: 'clock',
    title: 'Temps de lecture',
    unit: 'heures',
    value: (s) => Math.floor(s.total_reading_seconds / 3600),
    tiers: [
      { threshold: 1, label: 'Première heure' },
      { threshold: 5, label: 'Échauffement' },
      { threshold: 10, label: 'Rythme de croisière' },
      { threshold: 25, label: 'Lecteur assidu' },
      { threshold: 50, label: 'Marathon de lecture' },
      { threshold: 100, label: 'Centurion des pages' },
    ],
  },
  {
    id: 'streak',
    icon: 'zap',
    title: 'Série de lecture',
    unit: 'jours',
    value: (s) => s.streak_days,
    tiers: [
      { threshold: 3, label: 'Sur ta lancée' },
      { threshold: 7, label: 'Une semaine' },
      { threshold: 14, label: 'Deux semaines' },
      { threshold: 30, label: 'Un mois' },
      { threshold: 60, label: 'Inarrêtable' },
    ],
  },
  {
    id: 'genres',
    icon: 'compass',
    title: 'Genres explorés',
    unit: 'genres',
    value: (s) => s.distinct_genres,
    tiers: [
      { threshold: 3, label: 'Curieux' },
      { threshold: 5, label: 'Éclectique' },
      { threshold: 10, label: 'Touche-à-tout' },
      { threshold: 15, label: 'Sans frontières' },
    ],
  },
  {
    id: 'authors',
    icon: 'users',
    title: 'Auteurs différents',
    unit: 'auteurs',
    value: (s) => s.distinct_authors_read,
    tiers: [
      { threshold: 3, label: 'Premiers pas' },
      { threshold: 5, label: "Belle diversité" },
      { threshold: 10, label: 'Grand explorateur' },
      { threshold: 20, label: 'Encyclopédie vivante' },
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
