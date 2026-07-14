import { createClient } from '@supabase/supabase-js';

// Server-only route: reads the target user's push token with the
// service_role key (bypasses RLS entirely, as a trusted backend context) so
// the token itself is never exposed to any client — see db/schema.sql's
// push_tokens table comment. Sending still degrades silently on any
// failure, same as the old Express handler.
export async function POST(request: Request) {
  const { toUserId, title, body } = await request.json();
  if (!toUserId || !title || !body) {
    return Response.json({ error: 'toUserId, title and body are required' }, { status: 400 });
  }

  try {
    const supabaseAdmin = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabaseAdmin.from('push_tokens').select('token').eq('user_id', toUserId).maybeSingle();
    const token = data?.token;
    if (!token || !token.startsWith('ExponentPushToken')) {
      return Response.json({ skipped: true });
    }

    await fetch('https://exp.host/--/exponent-push-notification-server/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title, body }),
    });
    return Response.json({ sent: true });
  } catch {
    return Response.json({ skipped: true });
  }
}
