import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Mettre à jour la progression
router.put('/books/:bookId/progress', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { current_page, total_pages, progress_percent } = req.body;
    
    let percent = progress_percent;
    if (current_page && total_pages && total_pages > 0) {
      percent = Math.round((current_page / total_pages) * 100 * 100) / 100;
    }

    const result = await pool.query(
      `UPDATE user_books 
       SET current_page=$1, total_pages=$2, progress_percent=$3
       WHERE user_id=$4 AND book_id=$5 RETURNING *`,
      [current_page || 0, total_pages || 0, percent || 0, req.user!.id, req.params.bookId]
    );
    
    // Créer une activité dans le feed
    await pool.query(
      `INSERT INTO activity_feed (user_id, book_id, activity_type, metadata)
       VALUES ($1, $2, 'progress_update', $3)`,
      [req.user!.id, req.params.bookId, JSON.stringify({ percent, current_page, total_pages })]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur mise à jour progression' });
  }
});

// Ajouter une réaction
router.post('/books/:bookId/reactions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { emoji, note, progress_percent, page_number, is_public } = req.body;
    
    const result = await pool.query(
      `INSERT INTO reading_reactions 
       (user_id, book_id, emoji, note, progress_percent, page_number, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user!.id, req.params.bookId, emoji, note, progress_percent, page_number, is_public ?? true]
    );

    // Ajouter au feed si public
    if (is_public !== false) {
      await pool.query(
        `INSERT INTO activity_feed (user_id, book_id, activity_type, reaction_id, metadata)
         VALUES ($1, $2, 'reaction', $3, $4)`,
        [req.user!.id, req.params.bookId, result.rows[0].id, 
         JSON.stringify({ emoji, note, progress_percent, page_number })]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur ajout réaction' });
  }
});

// Récupérer les réactions d'un livre
router.get('/books/:bookId/reactions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.username FROM reading_reactions r
       JOIN users u ON u.id = r.user_id
       WHERE r.book_id = $1 AND r.user_id = $2
       ORDER BY r.progress_percent ASC`,
      [req.params.bookId, req.user!.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur récupération réactions' });
  }
});

export default router;