import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

async function sendPushNotification(pushToken: string, title: string, body: string, data?: any) {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return;
  try {
    await fetch('https://exp.host/--/exponent-push-notification-server/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, data: data ?? {}, sound: 'default' }),
    });
  } catch (_) {}
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.avatar_url,
              COUNT(ub.id) as books_count
       FROM friendships f
       JOIN users u ON (
         CASE WHEN f.requester_id = $1 THEN f.receiver_id ELSE f.requester_id END = u.id
       )
       LEFT JOIN user_books ub ON ub.user_id = u.id AND ub.status = 'done'
       WHERE (f.requester_id = $1 OR f.receiver_id = $1) AND f.status = 'accepted'
       GROUP BY u.id, u.username, u.avatar_url`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération amis' });
  }
});

router.post('/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { receiver_id } = req.body;
    const result = await pool.query(
      `INSERT INTO friendships (requester_id, receiver_id) VALUES ($1,$2) RETURNING *`,
      [req.user!.id, receiver_id]
    );

    // Récupérer le push token du destinataire et le nom de l'expéditeur
    const [receiverRow, senderRow] = await Promise.all([
      pool.query('SELECT push_token FROM users WHERE id=$1', [receiver_id]),
      pool.query('SELECT username FROM users WHERE id=$1', [req.user!.id]),
    ]);
    const pushToken = receiverRow.rows[0]?.push_token;
    const senderName = senderRow.rows[0]?.username ?? 'Quelqu\'un';

    sendPushNotification(pushToken, '👥 Nouvelle demande d\'ami', `${senderName} veut être ton ami lecteur !`, { type: 'friend_request', friendship_id: result.rows[0].id });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur demande ami' });
  }
});

router.put('/request/:id/accept', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE friendships SET status='accepted' WHERE id=$1 AND receiver_id=$2 RETURNING *`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Demande introuvable' });

    // Notifier l'expéditeur que sa demande a été acceptée
    const [requesterRow, acceptorRow] = await Promise.all([
      pool.query('SELECT push_token FROM users WHERE id=$1', [result.rows[0].requester_id]),
      pool.query('SELECT username FROM users WHERE id=$1', [req.user!.id]),
    ]);
    const pushToken = requesterRow.rows[0]?.push_token;
    const acceptorName = acceptorRow.rows[0]?.username ?? 'Quelqu\'un';

    sendPushNotification(pushToken, '🎉 Demande acceptée !', `${acceptorName} a accepté ta demande d'ami !`, { type: 'friend_accepted' });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur acceptation' });
  }
});

router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });
    const result = await pool.query(
      `SELECT u.id, u.username, u.avatar_url,
              COUNT(ub.id) as books_count
       FROM users u
       LEFT JOIN user_books ub ON ub.user_id = u.id AND ub.status = 'done'
       WHERE u.username ILIKE $1 AND u.id != $2
       GROUP BY u.id, u.username, u.avatar_url
       LIMIT 10`,
      [`%${q}%`, req.user!.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur recherche' });
  }
});

router.delete('/request/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      `DELETE FROM friendships WHERE id=$1 AND receiver_id=$2`,
      [req.params.id, req.user!.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression demande' });
  }
});

router.get('/pending', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT f.id, u.username, u.avatar_url, f.created_at
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur demandes' });
  }
});

router.get('/:userId/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const [userRow, statsRow, readingRow] = await Promise.all([
      pool.query('SELECT id, username, avatar_url FROM users WHERE id=$1', [userId]),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status='done') as done_count,
           COUNT(*) FILTER (WHERE status='to_read') as to_read_count,
           COUNT(*) FILTER (WHERE status='reading') as reading_count,
           ROUND(AVG(rating::numeric) FILTER (WHERE rating IS NOT NULL), 2) as avg_rating
         FROM user_books WHERE user_id=$1`,
        [userId]
      ),
      pool.query(
        `SELECT b.title, b.author, b.genres, ub.progress_percent, ub.current_page, ub.total_pages
         FROM user_books ub JOIN books b ON b.id = ub.book_id
         WHERE ub.user_id=$1 AND ub.status='reading'
         ORDER BY ub.updated_at DESC LIMIT 3`,
        [userId]
      ),
    ]);

    if (userRow.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });

    res.json({
      user: userRow.rows[0],
      stats: statsRow.rows[0],
      currentlyReading: readingRow.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur profil utilisateur' });
  }
});

export default router;
