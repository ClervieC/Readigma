import { supabase, getCurrentUserId } from './supabase';

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  return userId;
}

export async function setGoal(targetBooks: number, year = new Date().getFullYear()) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('reading_goals')
    .upsert({ user_id: userId, year, target_books: targetBooks }, { onConflict: 'user_id,year' });
  if (error) throw new Error(error.message);
}

export async function getGoal(year = new Date().getFullYear()) {
  const { data, error } = await supabase.rpc('goal_progress', { p_year: year });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return {
    goal: row?.target_books != null ? { target_books: row.target_books } : null,
    books_read: row?.books_read ?? 0,
    year,
  };
}

export async function getMonthly(year = new Date().getFullYear()) {
  const { data, error } = await supabase.rpc('goal_monthly', { p_year: year });
  if (error) throw new Error(error.message);
  return data ?? [];
}
