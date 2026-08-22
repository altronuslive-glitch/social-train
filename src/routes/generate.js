/**
 * Route: /api/generate/images
 * Генерация изображений через Grok API
 */

import { Router } from 'express';
import { generateImageAdvanced } from '../services/grok.js';

const router = Router();

/**
 * POST /api/generate/image
 * Генерирует одно изображение для поста через Grok.
 * Body: {
 *   imagePrompt: "...",
 *   negativePrompt: "...",
 *   aspectRatio: "1:1"
 * }
 */
router.post('/image', async (req, res) => {
  const { imagePrompt, negativePrompt, aspectRatio } = req.body;

  if (!imagePrompt) {
    return res.status(400).json({ error: 'Необходим imagePrompt' });
  }

  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GROK_API_KEY не настроен на сервере' });
  }

  try {
    console.log(`🎨 Генерация изображения через Grok...`);

    const imageUrl = await generateImageAdvanced({
      prompt: imagePrompt,
      negativePrompt: negativePrompt || '',
      aspectRatio: aspectRatio || '1:1',
      apiKey,
    });

    console.log(`✅ Изображение сгенерировано`);

    res.json({
      success: true,
      imageUrl,
    });

  } catch (err) {
    console.error('Generate image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/generate/images
 * Генерирует изображения для постов через Grok API.
 * Body: {
 *   posts: [{imagePrompt, negativePrompt, aspectRatio, ...}],
 *   grokApiKey: "xai-..."
 * }
 */
router.post('/images', async (req, res) => {
  const { posts, grokApiKey } = req.body;

  if (!posts || !Array.isArray(posts) || posts.length === 0) {
    return res.status(400).json({ error: 'Необходим массив posts с промптами' });
  }

  if (!grokApiKey) {
    return res.status(400).json({ error: 'Необходим grokApiKey для генерации изображений' });
  }

  try {
    console.log(`\n🎨 Генерация изображений для ${posts.length} постов...`);

    const results = [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      console.log(`  🖼️  Генерация ${i + 1}/${posts.length}: ${post.topicTitle || 'Пост ' + (i + 1)}`);

      try {
        const imageUrl = await generateImageAdvanced({
          prompt: post.imagePrompt,
          negativePrompt: post.negativePrompt,
          aspectRatio: post.aspectRatio || '1:1',
          apiKey: grokApiKey,
        });

        results.push({
          postIndex: i,
          topicId: post.topicId,
          topicTitle: post.topicTitle,
          imageUrl,
          status: 'success',
          prompt: post.imagePrompt,
        });

        console.log(`    ✅ Готово`);
      } catch (error) {
        console.error(`    ❌ Ошибка: ${error.message}`);

        results.push({
          postIndex: i,
          topicId: post.topicId,
          topicTitle: post.topicTitle,
          imageUrl: null,
          status: 'error',
          error: error.message,
          prompt: post.imagePrompt,
        });
      }

      // Небольшая пауза между запросами
      if (i < posts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    console.log(`\n✅ Генерация завершена: ${successCount}/${posts.length} успешно`);

    res.json({
      success: true,
      total: posts.length,
      successCount,
      results,
    });

  } catch (err) {
    console.error('Generate images error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/generate/test-grok-key
 * Проверяет валидность Grok API ключа.
 * Body: {
 *   grokApiKey: "xai-..."
 * }
 */
router.post('/test-grok-key', async (req, res) => {
  const { grokApiKey } = req.body;

  if (!grokApiKey) {
    return res.status(400).json({ error: 'Необходим grokApiKey' });
  }

  try {
    const { testGrokApiKey } = await import('../services/grok.js');
    const isValid = await testGrokApiKey(grokApiKey);

    res.json({
      valid: isValid,
      message: isValid ? 'Ключ валидный' : 'Ключ невалидный',
    });
  } catch (err) {
    res.json({
      valid: false,
      message: err.message,
    });
  }
});

export default router;
