import { supabase, getCurrentUserId } from './supabase';

export type ShelfFrameKind = 'frame' | 'plant';

export type ShelfFrame = {
  id: string;
  status: string;
  position: number;
  kind: ShelfFrameKind;
  book_id: string | null;
  image_url: string | null;
  manual_tilt: number | null;
};

async function requireUserId() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Non connecté');
  return userId;
}

export async function getShelfFrames(status: string): Promise<ShelfFrame[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('shelf_frames')
    .select('id,status,position,kind,book_id,image_url,manual_tilt')
    .eq('user_id', userId)
    .eq('status', status);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// `position` is a raw book count — "this many books come before the frame"
// in that status's shelf order (see buildRows/interleaveFrames in
// library.tsx, and the tap-to-place "ghost" placement flow). A 'plant' never
// gets `content` — it's purely decorative.
export async function addShelfFrame(
  status: string,
  position: number,
  kind: ShelfFrameKind,
  content?: { bookId: string } | { imageUrl: string },
): Promise<ShelfFrame> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('shelf_frames')
    .insert({
      user_id: userId,
      status,
      position,
      kind,
      book_id: content && 'bookId' in content ? content.bookId : null,
      image_url: content && 'imageUrl' in content ? content.imageUrl : null,
    })
    .select('id,status,position,kind,book_id,image_url,manual_tilt')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setShelfFrameContent(
  frameId: string,
  content: { bookId: string } | { imageUrl: string },
) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shelf_frames')
    .update({
      book_id: 'bookId' in content ? content.bookId : null,
      image_url: 'imageUrl' in content ? content.imageUrl : null,
    })
    .eq('user_id', userId)
    .eq('id', frameId);
  if (error) throw new Error(error.message);
}

// null cycles back to the automatic (hashed) angle — see frameTilt in
// app/(tabs)/library.tsx.
export async function setShelfFrameTilt(frameId: string, tilt: -1 | 0 | 1 | null) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shelf_frames')
    .update({ manual_tilt: tilt })
    .eq('user_id', userId)
    .eq('id', frameId);
  if (error) throw new Error(error.message);
}

export async function setShelfFramePosition(frameId: string, position: number) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shelf_frames')
    .update({ position })
    .eq('user_id', userId)
    .eq('id', frameId);
  if (error) throw new Error(error.message);
}

export async function removeShelfFrame(frameId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('shelf_frames')
    .delete()
    .eq('user_id', userId)
    .eq('id', frameId);
  if (error) throw new Error(error.message);
}
