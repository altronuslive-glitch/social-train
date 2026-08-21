import 'dotenv/config';
import express from 'express';
import contentRoutes from './routes/content.js';
import analyzeRoutes from './routes/analyze.js';
import testApiRoutes from './routes/test-api.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check — для Railway (Railway периодически пингует этот URL, чтобы убедиться что сервис жив)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'social-train' });
});

// Тестирование API ключей нейросетей
app.use('/api/test-api', testApiRoutes);

app.use('/api/content', contentRoutes);

// Анализ VK-страницы + генерация 20 постов через мульти-агентный пайплайн
app.use('/api/analyze', analyzeRoutes);

app.listen(PORT, () => {
  console.log(`Social Train running on port ${PORT}`);
});
