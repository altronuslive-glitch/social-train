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
 * POST /api/channels/:id/posts
 * Body: { selectedTopicIds: [1, 3, 5] }
 * Генерирует посты по выбранным темам и сохраняет их в канал.
 */
router.post('/:id/posts', async (req, res) => {
  const channelId = Number(req.params.id);
  const { selectedTopicIds } = req.body;

  const channel = getChannel(req.user.id, channelId);

  if (!channel) {
    return res.status(404).json({ error: 'Канал не найден' });
  }

  if (!Array.isArray(selectedTopicIds) || selectedTopicIds.length === 0) {
    return res.status(400).json({ error: 'Не выбрано ни одной темы' });
  }

  const selectedTopics = (channel.topics || []).filter(t => selectedTopicIds.includes(t.id));

  if (selectedTopics.length === 0) {
    return res.status(400).json({ error: 'Выбранные темы не найдены' });
  }

  try {
    console.log(`\n🤖 Генерация ${selectedTopics.length} постов для ${channel.handle}...`);

    const generated = await generatePostsByTopics(channel.brandCard, selectedTopics, (progress) => {
      if (progress.step === 'post_generated') {
        console.log(`  ✅ Пост ${progress.index}/${progress.total}: ${progress.post.topicTitle}`);
      }
    });

    const posts = addPosts(channelId, generated);

    const approvedCount = generated.filter(p => p.artDirectorVerdict === 'APPROVED').length;
    console.log(`✅ Готово! Одобрено арт-директором: ${approvedCount}/${generated.length}`);

    res.json({
      success: true,
      posts,
      generatedCount: generated.length,
      approvedCount,
    });
  } catch (err) {
    console.error('Generate posts error:', err.message);
    res.status(500).json({ error: err.message });
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
