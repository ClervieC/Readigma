import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Créer/mettre à jour un objectif
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { year, target_books } = req.body;
    const result = await pool.query(
      `INSERT INTO reading_goals (user_id, year, target_books)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, year) DO UPDATE SET target_books = $3
       RETURNING *`,
      [req.user!.id, year || new Date().getFullYear(), target_books]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur objectif' });
  }
});

// Récupérer l'objectif + progression
router.get('/:year', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const year = parseInt(req.params.year as string);
    const goalResult = await pool.query(
      `SELECT * FROM reading_goals WHERE user_id=$1 AND year=$2`,
      [req.user!.id, year]
    );
    
    const booksRead = await pool.query(
      `SELECT COUNT(*) FROM user_books ub
       WHERE ub.user_id=$1 AND ub.status='done'
       AND EXTRACT(YEAR FROM ub.finished_at) = $2`,
      [req.user!.id, year]
    );

    res.json({
      goal: goalResult.rows[0] || null,
      books_read: parseInt(booksRead.rows[0].count),
      year
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération objectif' });
  }
});

export default router;