import { supabase } from './supabase';

export async function getFeed() {
  const { data, error } = await supabase.rpc('get_feed');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Returns the post's new liked state (true = now liked) — see
// toggle_feed_like() in db/schema.sql, which also re-checks that the post is
// actually visible to the caller (self or accepted friend) server-side.
export async function toggleLike(feedId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_feed_like', { p_feed_id: feedId });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export type FeedComment = { id: string; user_id: string; username: string; avatar_url: string | null; comment: string; created_at: string };

export async function getComments(feedId: string): Promise<FeedComment[]> {
  const { data, error } = await supabase.rpc('get_feed_comments', { p_feed_id: feedId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addComment(feedId: string, comment: string): Promise<FeedComment> {
  const { data, error } = await supabase.rpc('add_feed_comment', { p_feed_id: feedId, p_comment: comment });
  if (error) throw new Error(error.message);
  return (data as FeedComment[])[0];
}
