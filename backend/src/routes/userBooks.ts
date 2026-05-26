import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/books', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    let query = `SELECT ub.*, b.title, b.author, b.cover_url, b.genres, b.tropes
                 FROM user_books ub JOIN books b ON b.id = ub.book_id
                 WHERE ub.user_id = $1`;
    const params: any[] = [req.user!.id];
    if (status) { params.push(status); query += ` AND ub.status = $${params.length}`; }
    query += ' ORDER BY ub.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération livres' });
  }
});

router.post('/books', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { book_id, status } = req.body;
    const result = await pool.query(
      `INSERT INTO user_books (user_id, book_id, status) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, book_id) DO UPDATE SET status=$3 RETURNING *`,
      [req.user!.id, book_id, status || 'to_read']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur ajout livre' });
  }
});

router.put('/books/:bookId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rating, comment, status } = req.body;
    if (rating !== undefined) {
      const rounded = Math.round(rating * 4) / 4;
      if (rounded < 0 || rounded > 5)
        return res.status(400).json({ error: 'Note entre 0 et 5' });
    }
    const result = await pool.query(
      `UPDATE user_books SET rating=$1, comment=$2, status=$3
       WHERE user_id=$4 AND book_id=$5 RETURNING *`,
      [rating, comment, status, req.user!.id, req.params.bookId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour' });
  }
});

router.delete('/books/:bookId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM user_books WHERE user_id=$1 AND book_id=$2', [req.user!.id, req.params.bookId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

export default router;