/**
 * Route: /api/channels
 * Личный кабинет: сохранённые каналы, их карточки бренда, темы и посты.
 * Весь роутер закрыт авторизацией.
 */

import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { generateTopics } from '../services/topicGenerator.js';
import { generatePostsByTopics } from '../services/pipeline.js';
import { generateImageAdvanced } from '../services/grok.js';
import { persistImage, removeImage } from '../services/imageStore.js';
import { openStream } from '../services/sse.js';
import {
  listChannels,
  getChannel,
  ownsChannel,
  updateBrandCard,
  updateTopics,
  deleteChannel,
  addPosts,
  getPostForUser,
  updatePostText,
  setPostImage,
} from '../db/repositories.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/channels
 * Список каналов пользователя для карточек в кабинете.
 */
router.get('/', (req, res) => {
  res.json({ channels: listChannels(req.user.id) });
});

/**
 * GET /api/channels/:id
 * Канал целиком: карточка бренда, темы и посты.
 */
router.get('/:id', (req, res) => {
  const channel = getChannel(req.user.id, Number(req.params.id));

  if (!channel) {
    return res.status(404).json({ error: 'Канал не найден' });
  }

  res.json({ channel });
});

/**
 * PATCH /api/channels/:id/brand-card
 * Body: { brandCard: {...} }
 */
router.patch('/:id/brand-card', (req, res) => {
  const { brandCard } = req.body;

  if (!brandCard || typeof brandCard !== 'object') {
    return res.status(400).json({ error: 'Необходима карточка бренда' });
  }

  const updated = updateBrandCard(req.user.id, Number(req.params.id), brandCard);

  if (!updated) {
    return res.status(404).json({ error: 'Канал не найден' });
  }

  res.json({ success: true });
});

/**
 * POST /api/channels/:id/topics
 * Генерирует темы заново на основе текущей (возможно отредактированной)
 * карточки бренда и сохраняет их.
 */
router.post('/:id/topics', async (req, res) => {
  const channelId = Number(req.params.id);
  const channel = getChannel(req.user.id, channelId);

  if (!channel) {
    return res.status(404).json({ error: 'Канал не найден' });
  }

  if (!channel.brandCard) {
    return res.status(400).json({ error: 'У канала нет карточки бренда' });
  }

  try {
    console.log(`\n💡 Генерация тем для канала ${channel.handle}...`);

    const { topics, groups } = await generateTopics(channel.brandCard);

    updateTopics(req.user.id, channelId, topics, groups);

    console.log(`✅ Сгенерировано тем: ${topics.length}`);

    res.json({ success: true, topics, groups });
  } catch (err) {
    console.error('Generate topics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Находит канал и выбранные в нём темы, попутно проверяя, что запрос
 * осмысленный. Общее начало обычного и потокового эндпоинтов генерации.
 *
 * @param {number} userId
 * @param {number} channelId
 * @param {number[]} selectedTopicIds
 * @returns {{status: number, error: string} | {channel: object, selectedTopics: object[]}}
 */
function resolveTopicSelection(userId, channelId, selectedTopicIds) {
  const channel = getChannel(userId, channelId);

  if (!channel) {
    return { status: 404, error: 'Канал не найден' };
  }

  if (!Array.isArray(selectedTopicIds) || selectedTopicIds.length === 0) {
    return { status: 400, error: 'Не выбрано ни одной темы' };
  }

  const selectedTopics = (channel.topics || []).filter(t => selectedTopicIds.includes(t.id));

  if (selectedTopics.length === 0) {
    return { status: 400, error: 'Выбранные темы не найдены' };
  }

  return { channel, selectedTopics };
}

/**
 * Генерирует посты по темам и сохраняет их в канал.
 * @param {object} channel — канал целиком, как его отдаёт getChannel
 * @param {object[]} selectedTopics
 * @param {(progress: {index: number, total: number, post: object}) => void} [onPost]
 *   — вызывается после каждого готового поста
 * @returns {Promise<{posts: object[], generatedCount: number, approvedCount: number}>}
 */
async function generateAndSavePosts(channel, selectedTopics, onPost = () => {}) {
  console.log(`\n🤖 Генерация ${selectedTopics.length} постов для ${channel.handle}...`);

  const generated = await generatePostsByTopics(channel.brandCard, selectedTopics, (progress) => {
    if (progress.step !== 'post_generated') return;

    console.log(`  ✅ Пост ${progress.index}/${progress.total}: ${progress.post.topicTitle}`);
    onPost(progress);
  });

  const posts = addPosts(channel.id, generated);
  const approvedCount = generated.filter(p => p.artDirectorVerdict === 'APPROVED').length;

  console.log(`✅ Готово! Одобрено арт-директором: ${approvedCount}/${generated.length}`);

  return { posts, generatedCount: generated.length, approvedCount };
}

/**
 * POST /api/channels/:id/posts
 * Body: { selectedTopicIds: [1, 3, 5] }
 * Генерирует посты по выбранным темам и сохраняет их в канал.
 *
 * Как и с анализом: на многих темах это дольше, чем терпит шлюз Railway,
 * поэтому интерфейс ходит в потоковый эндпоинт ниже, а этот остаётся
 * для обращений к API напрямую.
 */
router.post('/:id/posts', async (req, res) => {
  const selection = resolveTopicSelection(req.user.id, Number(req.params.id), req.body.selectedTopicIds);

  if (selection.error) {
    return res.status(selection.status).json({ error: selection.error });
  }

  try {
    const result = await generateAndSavePosts(selection.channel, selection.selectedTopics);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Generate posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/channels/:id/posts/stream?topicIds=1,3,5
 * То же самое потоком: после каждого готового поста браузер получает
 * честное «пост 3 из 7» вместо нарисованного прогресса.
 * В финальном событии приходят все сохранённые посты.
 */
router.get('/:id/posts/stream', async (req, res) => {
  const topicIds = String(req.query.topicIds || '')
    .split(',')
    .map(Number)
    .filter(Number.isInteger);

  const selection = resolveTopicSelection(req.user.id, Number(req.params.id), topicIds);

  if (selection.error) {
    return res.status(selection.status).json({ error: selection.error });
  }

  const { channel, selectedTopics } = selection;
  const stream = openStream(res);

  try {
    stream.send({
      step: 'start',
      message: `🤖 Генерирую посты: 0 из ${selectedTopics.length}`,
      progress: 5,
    });

    const result = await generateAndSavePosts(channel, selectedTopics, ({ index, total, post }) => {
      stream.send({
        step: 'post_generated',
        message: `✍️ Готов пост ${index} из ${total}: ${post.topicTitle}`,
        // Оставляем последние 5% на сохранение и отрисовку
        progress: Math.round((index / total) * 95),
      });
    });

    stream.send({
      step: 'complete',
      message: '✅ Посты готовы!',
      progress: 100,
      data: result,
    });
  } catch (err) {
    console.error('Generate posts stream error:', err.message);
    stream.send({ step: 'error', message: err.message });
  } finally {
    stream.close();
  }
});

/**
 * DELETE /api/channels/:id
 * Удаляет канал вместе с постами. Файлы картинок тоже подчищаем.
 */
router.delete('/:id', async (req, res) => {
  const channelId = Number(req.params.id);
  const channel = getChannel(req.user.id, channelId);

  if (!channel) {
    return res.status(404).json({ error: 'Канал не найден' });
  }

  // Сначала файлы, потом строки — иначе имена файлов уже не узнать
  for (const post of channel.posts) {
    if (post.imageUrl) {
      await removeImage(post.imageUrl.replace('/media/', ''));
    }
  }

  deleteChannel(req.user.id, channelId);

  res.json({ success: true });
});

export default router;

/**
 * Отдельный роутер для операций с конкретным постом.
 * Монтируется как /api/posts.
 */
export const postsRouter = Router();

postsRouter.use(requireAuth);

/**
 * PATCH /api/posts/:id
 * Body: { postText: "..." }
 * Сохраняет отредактированный текст поста.
 */
postsRouter.patch('/:id', (req, res) => {
  const { postText } = req.body;

  if (typeof postText !== 'string') {
    return res.status(400).json({ error: 'Необходим текст поста' });
  }

  const updated = updatePostText(req.user.id, Number(req.params.id), postText);

  if (!updated) {
    return res.status(404).json({ error: 'Пост не найден' });
  }

  res.json({ success: true });
});

/**
 * POST /api/posts/:id/image
 * Генерирует картинку через Grok и сохраняет её у нас.
 */
postsRouter.post('/:id/image', async (req, res) => {
  const postId = Number(req.params.id);
  const post = getPostForUser(req.user.id, postId);

  if (!post) {
    return res.status(404).json({ error: 'Пост не найден' });
  }

  if (!post.image_prompt) {
    return res.status(400).json({ error: 'У поста нет промпта для изображения' });
  }

  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GROK_API_KEY не настроен на сервере' });
  }

  try {
    console.log(`🎨 Генерация изображения для поста ${postId}...`);

    const temporaryUrl = await generateImageAdvanced({
      prompt: post.image_prompt,
      negativePrompt: post.negative_prompt || '',
      aspectRatio: post.aspect_ratio || '1:1',
      apiKey,
    });

    // Ссылки Grok временные — сразу забираем файл себе
    const fileName = await persistImage(temporaryUrl);

    // Старую картинку поста удаляем, чтобы не копить мусор при перегенерации
    if (post.image_path) {
      await removeImage(post.image_path);
    }

    setPostImage(req.user.id, postId, fileName);

    console.log(`✅ Изображение сохранено: ${fileName}`);

    res.json({ success: true, imageUrl: `/media/${fileName}` });
  } catch (err) {
    console.error('Post image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
