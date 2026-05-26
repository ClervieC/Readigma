import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, author, message } = req.body;
    const result = await pool.query(
      `INSERT INTO book_suggestions (user_id, title, author, message) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user!.id, title, author, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur suggestion' });
  }
});

router.get('/admin', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT bs.*, u.username FROM book_suggestions bs
       JOIN users u ON u.id = bs.user_id
       ORDER BY bs.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération suggestions' });
  }
});

router.put('/admin/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE book_suggestions SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour suggestion' });
  }
});

export default router;