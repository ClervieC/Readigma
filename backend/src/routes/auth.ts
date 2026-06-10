import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/jwt';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    const existing = await pool.query('SELECT id FROM users WHERE email=$1 OR username=$2', [email, username]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email ou username déjà utilisé' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, email, role',
      [username, email, hash]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/push-token', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    await pool.query('UPDATE users SET push_token=$1 WHERE id=$2', [token, req.user!.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour push token' });
  }
});

router.put('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password, avatar_url } = req.body;
    const userId = req.user!.id;

    if (username) {
      const exists = await pool.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username, userId]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
    }
    if (email) {
      const exists = await pool.query('SELECT id FROM users WHERE email=$1 AND id!=$2', [email, userId]);
      if (exists.rows.length > 0) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (username) { params.push(username); updates.push(`username=$${params.length}`); }
    if (email) { params.push(email); updates.push(`email=$${params.length}`); }
    if (password) { const hash = await bcrypt.hash(password, 10); params.push(hash); updates.push(`password_hash=$${params.length}`); }
    if (avatar_url !== undefined) { params.push(avatar_url); updates.push(`avatar_url=$${params.length}`); }

    if (updates.length === 0) return res.status(400).json({ error: 'Aucune modification' });

    params.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id=$${params.length} RETURNING id, username, email, role, avatar_url`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour profil' });
  }
});

export default router;