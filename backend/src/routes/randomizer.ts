import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/randomize', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { genre, trope } = req.query;
    let query = `SELECT b.* FROM user_books ub
                 JOIN books b ON b.id = ub.book_id
                 WHERE ub.user_id = $1 AND ub.status = 'to_read'`;
    const params: any[] = [req.user!.id];
    if (genre) { params.push(genre); query += ` AND $${params.length} = ANY(b.genres)`; }
    if (trope) { params.push(trope); query += ` AND $${params.length} = ANY(b.tropes)`; }
    query += ' ORDER BY RANDOM() LIMIT 1';
    const result = await pool.query(query, params);
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Aucun livre trouvé avec ce filtre' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur randomizer' });
  }
});

export default router;