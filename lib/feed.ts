import { supabase } from './supabase';

export async function getFeed() {
  const { data, error } = await supabase.rpc('get_feed');
  if (error) throw new Error(error.message);
  return data ?? [];
}
