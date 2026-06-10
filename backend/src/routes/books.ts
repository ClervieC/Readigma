import { Router, Request, Response } from 'express';
import axios from 'axios';
import pool from '../config/database';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Paramètre q requis' });
    const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
      params: { q, maxResults: 10, key: process.env.GOOGLE_BOOKS_API_KEY }
    });
    const books = (response.data.items || []).map((item: any) => ({
      google_books_id: item.id,
      title: item.volumeInfo.title,
      author: item.volumeInfo.authors?.join(', ') || 'Auteur inconnu',
      cover_url: item.volumeInfo.imageLinks?.thumbnail || null,
      description: item.volumeInfo.description || null,
      published_year: parseInt(item.volumeInfo.publishedDate) || null,
      genres: item.volumeInfo.categories || [],
    }));
    res.json(books);
  } catch (err) {
    res.status(500).json({ error: 'Erreur recherche Google Books' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { google_books_id, title, author, cover_url, description, genres, tropes, published_year } = req.body;
    const result = await pool.query(
      `INSERT INTO books (google_books_id, title, author, cover_url, description, genres, tropes, published_year, approved)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
      ON CONFLICT (google_books_id) DO UPDATE SET
        title = EXCLUDED.title,
        author = EXCLUDED.author,
        cover_url = EXCLUDED.cover_url
      RETURNING *`,
      [google_books_id, title, author, cover_url, description, genres, tropes, published_year]
    );
    res.status(201).json(result.rows[0]);
  }catch (err) {
    console.error('Erreur ajout livre:', err);
    res.status(500).json({ error: 'Erreur ajout livre', details: (err as any).message });
  }
});

router.get('/trending', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const categories = [
      { label: '🔥 Tendances', query: 'bestseller 2025' },
      { label: '✨ Nouveautés', query: 'new releases fiction 2025' },
      { label: '💜 Fantasy', query: 'fantasy bestseller' },
      { label: '🔪 Thriller', query: 'thriller bestseller' },
    ];

    const results = await Promise.all(
      categories.map(async (cat) => {
        const res = await axios.get('https://www.googleapis.com/books/v1/volumes', {
          params: { q: cat.query, maxResults: 6, orderBy: 'relevance', key: process.env.GOOGLE_BOOKS_API_KEY }
        });
        return {
          label: cat.label,
          books: (res.data.items || []).map((item: any) => ({
            google_books_id: item.id,
            title: item.volumeInfo.title,
            author: item.volumeInfo.authors?.join(', ') || 'Auteur inconnu',
            cover_url: item.volumeInfo.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
            description: item.volumeInfo.description || null,
            published_year: parseInt(item.volumeInfo.publishedDate) || null,
            genres: item.volumeInfo.categories || [],
          }))
        };
      })
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Erreur trending' });
  }
});

router.get('/popular', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT b.*, COUNT(ub.id) as add_count
       FROM books b
       JOIN user_books ub ON ub.book_id = b.id
       WHERE b.approved = true
       GROUP BY b.id
       ORDER BY add_count DESC
       LIMIT 10`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur popular' });
  }
});

export default router;