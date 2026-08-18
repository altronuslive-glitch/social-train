import 'dotenv/config';
import express from 'express';
import contentRoutes from './routes/content.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check — для Railway (Railway периодически пингует этот URL, чтобы убедиться что сервис жив)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'social-train' });
});

app.use('/api/content', contentRoutes);

app.listen(PORT, () => {
  console.log(`Social Train running on port ${PORT}`);
});
