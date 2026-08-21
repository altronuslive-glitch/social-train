/**
 * Route: /api/analyze
 * v2: Новый workflow с карточкой бренда и выбором тем
 */

import { Router } from 'express';
import { parseTelegramChannel } from '../services/telegramParser.js';
import { analyzeChannelAndGenerateTopics, generatePostsByTopics } from '../services/pipeline.js';

const router = Router();

/**
 * POST /api/analyze/channel
 * Анализирует канал и возвращает карточку бренда + 20 предложенных тем.
 * Body: {
 *   channel: "cvetidnya",
 *   postsCount: 30
 * }
 */
router.post('/channel', async (req, res) => {
  const { channel, postsCount = 30 } = req.body;

  if (!channel) {
    return res.status(400).json({ error: 'Поле channel обязательно' });
  }

  try {
    console.log(`\n🚀 Анализ канала: t.me/${channel}`);

    // Шаг 1: Парсим Telegram-канал
    console.log('📥 Парсим посты...');
    const posts = await parseTelegramChannel({ channel, limit: postsCount });

    if (posts.length < 5) {
      return res.status(422).json({
        error: `Слишком мало постов (найдено: ${posts.length}). Убедись что канал публичный.`
      });
    }

    console.log(`✅ Получено ${posts.length} постов`);

    // Шаг 2-3-4: Анализ → Карточка бренда → Темы
    const { brandCard, topics } = await analyzeChannelAndGenerateTopics(posts);

    console.log('\n✅ Анализ завершён!');

    res.json({
      success: true,
      channel,
      analyzedPostsCount: posts.length,
      brandCard,
      topics,
    });

  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/analyze/generate-posts
 * Генерирует посты по выбранным темам.
 * Body: {
 *   brandCard: {...},
 *   selectedTopicIds: [1, 3, 5, ...]
 *   topics: [...]
 * }
 */
router.post('/generate-posts', async (req, res) => {
  const { brandCard, selectedTopicIds, topics } = req.body;

  if (!brandCard || !selectedTopicIds || !topics) {
    return res.status(400).json({
      error: 'Необходимы поля: brandCard, selectedTopicIds, topics'
    });
  }

  try {
    console.log(`\n🤖 Генерация постов по ${selectedTopicIds.length} темам...`);

    // Фильтруем только выбранные темы
    const selectedTopics = topics.filter(t => selectedTopicIds.includes(t.id));

    if (selectedTopics.length === 0) {
      return res.status(400).json({ error: 'Не выбрано ни одной темы' });
    }

    // Генерируем посты
    const posts = await generatePostsByTopics(brandCard, selectedTopics);

    const approvedCount = posts.filter(p => p.artDirectorVerdict === 'APPROVED').length;
    console.log(`\n✅ Готово! Одобрено: ${approvedCount}/${posts.length}`);

    res.json({
      success: true,
      postsCount: posts.length,
      approvedCount,
      posts,
    });

  } catch (err) {
    console.error('Generate posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
