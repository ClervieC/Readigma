import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

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
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur acceptation' });
  }
});

export default router;