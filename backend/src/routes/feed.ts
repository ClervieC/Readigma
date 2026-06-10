import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
        af.id, af.activity_type, af.created_at, af.metadata,
        af.user_id, af.book_id,
        u.username, u.avatar_url,
        b.title as book_title, b.cover_url, b.author as book_author,
        b.genres, b.description, b.published_year,
        rr.emoji, rr.note, rr.progress_percent as reaction_percent
       FROM activity_feed af
       JOIN users u ON u.id = af.user_id
       LEFT JOIN books b ON b.id = af.book_id
       LEFT JOIN reading_reactions rr ON rr.id = af.reaction_id
       WHERE af.user_id IN (
         SELECT CASE 
           WHEN requester_id = $1 THEN receiver_id 
           ELSE requester_id 
         END
         FROM friendships 
         WHERE (requester_id = $1 OR receiver_id = $1) 
         AND status = 'accepted'
         UNION SELECT $1
       )
       ORDER BY af.created_at DESC
       LIMIT 50`,
      [req.user!.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur feed' });
  }
});

export default router;