/**
 * Route: /api/analyze
 * v2: Новый workflow с карточкой бренда и выбором тем
 */

import { Router } from 'express';
import { parseTelegramChannel } from '../services/telegramParser.js';
import { analyzeChannelAndGenerateTopics, generatePostsByTopics } from '../services/pipeline.js';
import { requireAuth } from '../middleware/auth.js';
import { createChannel } from '../db/repositories.js';

const router = Router();

// Генерация доступна только из личного кабинета
router.use(requireAuth);

/** Сколько постов канала анализируем — всегда одинаково, настройки нет. */
const ANALYZED_POSTS_COUNT = 30;

/**
 * Приводит ввод пользователя к чистому имени канала:
 * "https://t.me/cats/" и "@cats" одинаково становятся "cats".
 * @param {string} value
 * @returns {string}
 */
function normalizeHandle(value) {
  return value
    .trim()
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');
}

/**
 * POST /api/analyze/channel
 * Анализирует канал, сохраняет результат в кабинет пользователя
 * и возвращает карточку бренда + 20 предложенных тем.
 * Body: { channel: "cvetidnya" }
 */
router.post('/channel', async (req, res) => {
  const { channel } = req.body;

  if (!channel) {
    return res.status(400).json({ error: 'Поле channel обязательно' });
  }

  try {
    console.log(`\n🚀 Анализ канала: t.me/${channel}`);

    // Шаг 1: Парсим Telegram-канал
    console.log('📥 [1/4] Парсинг постов из Telegram...');
    const posts = await parseTelegramChannel({ channel, limit: ANALYZED_POSTS_COUNT });

    if (posts.length < 5) {
      return res.status(422).json({
        error: `Слишком мало постов (найдено: ${posts.length}). Убедись что канал публичный.`
      });
    }

    console.log(`✅ Получено ${posts.length} постов`);

    // Шаг 2-3-4: Анализ → Карточка бренда → Темы
    const { brandCard, topics } = await analyzeChannelAndGenerateTopics(posts, (progress) => {
      // Логируем прогресс
      if (progress.step === 'analysis_complete') {
        console.log('✅ [2/4] Анализ текста и изображений завершён');
      } else if (progress.step === 'brand_card_complete') {
        console.log('✅ [3/4] Карточка бренда сформирована');
      } else if (progress.step === 'topics_complete') {
        console.log('✅ [4/4] Темы сгенерированы');
      }
    });

    // Сохраняем результат в кабинет — дальше пользователь работает с ним оттуда
    const channelId = createChannel(req.user.id, {
      handle: normalizeHandle(channel),
      title: brandCard?.brand?.niche || channel,
      brandCard,
      topics: topics.topics,
      groups: topics.groups,
      analyzedPostsCount: posts.length,
    });

    console.log(`\n✅ Анализ завершён! Канал сохранён в кабинет (id ${channelId})`);

    res.json({
      success: true,
      channelId,
      channel,
      analyzedPostsCount: posts.length,
      brandCard,
      topics: topics.topics, // все темы в плоском массиве
      groups: topics.groups, // темы сгруппированные по типам
    });

  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analyze/channel/stream
 * SSE endpoint для real-time прогресса анализа
 */
router.get('/channel/stream', async (req, res) => {
  const { channel, postsCount = 30 } = req.query;

  if (!channel) {
    return res.status(400).json({ error: 'Параметр channel обязателен' });
  }

  // Настройка SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent({ step: 'start', message: '🚀 Запуск анализа канала...' });

    // Шаг 1: Парсинг
    sendEvent({ step: 'parsing', message: '📥 Парсинг постов из Telegram...', progress: 10 });
    const posts = await parseTelegramChannel({ channel, limit: parseInt(postsCount) });

    if (posts.length < 5) {
      sendEvent({ step: 'error', message: `Слишком мало постов (${posts.length})` });
      res.end();
      return;
    }

    sendEvent({ step: 'parsing_complete', message: `✅ Получено ${posts.length} постов`, progress: 20 });

    // Шаг 2-4: Анализ
    const { brandCard, topics } = await analyzeChannelAndGenerateTopics(posts, (progress) => {
      if (progress.step === 'text_analysis_start') {
        sendEvent({ step: 'text_analysis', message: '📝 Анализ текстового контента...', progress: 30 });
      } else if (progress.step === 'image_analysis_start') {
        sendEvent({ step: 'image_analysis', message: '🎨 Анализ визуального контента...', progress: 40 });
      } else if (progress.step === 'analysis_complete') {
        sendEvent({ step: 'analysis_complete', message: '✅ Анализ завершён', progress: 60 });
      } else if (progress.step === 'brand_card_complete') {
        sendEvent({ step: 'brand_card', message: '🎯 Карточка бренда сформирована', progress: 80 });
      } else if (progress.step === 'topics_complete') {
        sendEvent({ step: 'topics', message: '💡 Темы сгенерированы', progress: 95 });
      }
    });

    // Финал
    sendEvent({
      step: 'complete',
      message: '✅ Готово!',
      progress: 100,
      data: { brandCard, topics, analyzedPostsCount: posts.length }
    });

    res.end();

  } catch (err) {
    console.error('Stream error:', err.message);
    sendEvent({ step: 'error', message: err.message });
    res.end();
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
    const posts = await generatePostsByTopics(brandCard, selectedTopics, (progress) => {
      if (progress.step === 'post_generated') {
        console.log(`  ✅ Пост ${progress.index}/${progress.total}: ${progress.post.topicTitle}`);
      }
    });

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
