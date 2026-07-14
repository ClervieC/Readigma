import { supabase, getCurrentUserId } from './supabase';

export async function submitSuggestion(title: string, author: string, message: string) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  const { error } = await supabase.from('book_suggestions').insert({ user_id: userId, title, author, message });
  if (error) throw new Error(error.message);
}
