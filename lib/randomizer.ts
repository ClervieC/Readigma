import { supabase } from './supabase';

export async function randomize(genre?: string, trope?: string) {
  const { data, error } = await supabase.rpc('randomize_book', {
    p_genre: genre ?? null,
    p_trope: trope ?? null,
  });
  if (error) throw new Error(error.message);
  const book = data?.[0];
  if (!book) throw new Error('Aucun livre trouvé');
  return book;
}
