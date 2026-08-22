import 'dotenv/config';
import express from 'express';

import { initDb, MEDIA_DIR } from './db/index.js';
import { attachUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import channelRoutes, { postsRouter } from './routes/channels.js';
import contentRoutes from './routes/content.js';
import analyzeRoutes from './routes/analyze.js';
import generateRoutes from './routes/generate.js';
import testApiRoutes from './routes/test-api.js';

const app = express();
const PORT = process.env.PORT || 3000;

// База поднимается до роутов — они рассчитывают на готовую схему
initDb();

app.use(express.json({ limit: '2mb' }));

// Статические файлы (веб-интерфейс)
app.use(express.static('public'));

// Сохранённые картинки постов
app.use('/media', express.static(MEDIA_DIR, { maxAge: '7d' }));

// Определяем текущего пользователя до всех роутов
app.use(attachUser);

// Health check — для Railway (Railway периодически пингует этот URL, чтобы убедиться что сервис жив)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'social-train' });
});

// Аккаунты
app.use('/api/auth', authRoutes);

// Личный кабинет: каналы и посты
app.use('/api/channels', channelRoutes);
app.use('/api/posts', postsRouter);

// Тестирование API ключей нейросетей
app.use('/api/test-api', testApiRoutes);

app.use('/api/content', contentRoutes);

// Анализ канала + генерация постов (новый workflow v2)
app.use('/api/analyze', analyzeRoutes);

// Генерация изображений через Grok
app.use('/api/generate', generateRoutes);

app.listen(PORT, () => {
  console.log(`Social Train running on port ${PORT}`);
});
