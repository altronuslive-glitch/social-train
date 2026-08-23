/**
 * Route: /api/analyze
 * v2: Новый workflow с карточкой бренда и выбором тем
 */

import { Router } from 'express';
import { parseTelegramChannel } from '../services/telegramParser.js';
import { analyzeChannelAndGenerateTopics } from '../services/pipeline.js';
import { requireAuth } from '../middleware/auth.js';
import { createChannel } from '../db/repositories.js';
import { openStream } from '../services/sse.js';

const router = Router();

// Генерация доступна только из личного кабинета
router.use(requireAuth);

/** Сколько постов канала анализируем — всегда одинаково, настройки нет. */
const ANALYZED_POSTS_COUNT = 30;

/**
 * Как показывать этапы пайплайна пользователю.
 * Ключи — имена шагов из `analyzeChannelAndGenerateTopics`; шаги, которых
 * здесь нет, до пользователя не доводим.
 *
 * Тексты и картинки разбираются параллельно, поэтому на них один общий
 * этап: показывать их по очереди значило бы врать про порядок работы.
 * Проценты подобраны так, чтобы полоса всегда шла только вперёд.
 */
const STAGE_VIEW = {
  text_analysis_start: { progress: 30, message: '📝 Разбираю тексты и картинки постов...' },
  analysis_complete: { progress: 60, message: '✅ Посты разобраны' },
  brand_card_start: { progress: 70, message: '🎯 Формирую карточку бренда...' },
  brand_card_complete: { progress: 80, message: '✅ Карточка бренда готова' },
  topics_start: { progress: 88, message: '💡 Генерирую темы для постов...' },
  topics_complete: { progress: 95, message: '✅ Темы сгенерированы' },
};

/** Канал закрыт или почти пуст — единственная ожидаемая неудача анализа. */
class TooFewPostsError extends Error {
  constructor(found) {
    super(`Слишком мало постов (найдено: ${found}). Убедитесь, что канал публичный.`);
    this.name = 'TooFewPostsError';
  }
}

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
 * Полный цикл: парсинг → анализ → карточка бренда → темы → сохранение
 * в кабинет. Общий для обычного и потокового эндпоинтов — чтобы сохранение
 * канала не разъезжалось между ними.
 *
 * @param {number} userId
 * @param {string} channel — адрес или имя канала, как его ввёл пользователь
 * @param {(stage: {step: string, message: string, progress: number}) => void} [onStage]
 *   — вызывается на каждом этапе: обычный эндпоинт пишет это в лог,
 *   потоковый отправляет в браузер
 * @returns {Promise<{channelId: number, brandCard: object, topics: object, analyzedPostsCount: number}>}
 * @throws {TooFewPostsError} если канал закрыт или почти пуст
 */
async function analyzeAndSave(userId, channel, onStage = () => {}) {
  onStage({ step: 'parsing', message: '📥 Парсинг постов из Telegram...', progress: 10 });

  const posts = await parseTelegramChannel({ channel, limit: ANALYZED_POSTS_COUNT });

  if (posts.length < 5) {
    throw new TooFewPostsError(posts.length);
  }

  onStage({ step: 'parsing_complete', message: `✅ Получено постов: ${posts.length}`, progress: 20 });

  const { brandCard, topics } = await analyzeChannelAndGenerateTopics(posts, ({ step }) => {
    const view = STAGE_VIEW[step];
    if (view) onStage({ step, ...view });
  });

  // Сохраняем результат в кабинет — дальше пользователь работает с ним оттуда
  const channelId = createChannel(userId, {
    handle: normalizeHandle(channel),
    title: brandCard?.brand?.niche || channel,
    brandCard,
    topics: topics.topics,
    groups: topics.groups,
    analyzedPostsCount: posts.length,
  });

  return { channelId, brandCard, topics, analyzedPostsCount: posts.length };
}

/**
 * POST /api/analyze/channel
 * Анализирует канал, сохраняет результат в кабинет пользователя
 * и возвращает карточку бренда + предложенные темы.
 * Body: { channel: "cvetidnya" }
 *
 * Внимание: анализ идёт около шести минут, а шлюз Railway рвёт запрос
 * примерно на пятой. Интерфейс поэтому ходит в потоковый эндпоинт ниже,
 * а этот остаётся для обращений к API напрямую.
 */
router.post('/channel', async (req, res) => {
  const { channel } = req.body;

  if (!channel) {
    return res.status(400).json({ error: 'Поле channel обязательно' });
  }

  try {
    console.log(`\n🚀 Анализ канала: t.me/${channel}`);

    const { channelId, brandCard, topics, analyzedPostsCount } =
      await analyzeAndSave(req.user.id, channel, ({ message }) => console.log(message));

    console.log(`\n✅ Анализ завершён! Канал сохранён в кабинет (id ${channelId})`);

    res.json({
      success: true,
      channelId,
      channel,
      analyzedPostsCount,
      brandCard,
      topics: topics.topics, // все темы в плоском массиве
      groups: topics.groups, // темы сгруппированные по типам
    });

  } catch (err) {
    if (err instanceof TooFewPostsError) {
      return res.status(422).json({ error: err.message });
    }

    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/analyze/channel/stream?channel=cvetidnya
 * То же самое, но потоком: браузер видит этапы по мере готовности,
 * а соединение не простаивает и до обрыва шлюзом дело не доходит.
 * В финальном событии приходит `data.channelId` — канал уже в кабинете.
 */
router.get('/channel/stream', async (req, res) => {
  const { channel } = req.query;

  if (!channel) {
    return res.status(400).json({ error: 'Параметр channel обязателен' });
  }

  const stream = openStream(res);

  try {
    console.log(`\n🚀 Анализ канала (поток): t.me/${channel}`);
    stream.send({ step: 'start', message: '🚀 Запуск анализа канала...', progress: 5 });

    const { channelId } = await analyzeAndSave(req.user.id, channel, (stage) => {
      console.log(stage.message);
      stream.send(stage);
    });

    console.log(`\n✅ Анализ завершён! Канал сохранён в кабинет (id ${channelId})`);

    stream.send({ step: 'complete', message: '✅ Готово!', progress: 100, data: { channelId } });

  } catch (err) {
    console.error('Analyze stream error:', err.message);
    stream.send({ step: 'error', message: err.message });
  } finally {
    stream.close();
  }
});

export default router;
