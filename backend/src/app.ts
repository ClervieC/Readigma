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
import trackingRoutes from './routes/tracking';
import goalsRoutes from './routes/goals';
import feedRoutes from './routes/feed';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/me', userBookRoutes);
app.use('/api/me', randomizerRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/me', trackingRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/users', friendRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Readigma' }));

app.listen(PORT, () => console.log(`🚀 Readigma backend running on port ${PORT}`));

export default app;