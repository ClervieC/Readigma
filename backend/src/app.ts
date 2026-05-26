import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './routes/auth';
import bookRoutes from './routes/books';
import userBookRoutes from './routes/userBooks';
import randomizerRoutes from './routes/randomizer';
import friendRoutes from './routes/friends';
import suggestionRoutes from './routes/suggestions';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:4200'],
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/me', userBookRoutes);
app.use('/api/me', randomizerRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/suggestions', suggestionRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Readigma' }));

app.listen(PORT, () => console.log(`🚀 Readigma backend running on port ${PORT}`));

export default app;