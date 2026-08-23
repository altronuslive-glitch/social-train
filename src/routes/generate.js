/**
 * Route: /api/generate
 * Генерация изображений через Grok API — по одной штуке, по явному запросу.
 *
 * Пакетной генерации здесь намеренно нет: картинки делаются только вручную
 * для конкретного поста, уже после того как пользователь посмотрел тексты.
 * Интерфейс для этого ходит в POST /api/posts/:id/image — тот вдобавок
 * сохраняет файл у нас и привязывает его к посту.
 */

import { Router } from 'express';
import { generateImageAdvanced } from '../services/grok.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Генерация доступна только из личного кабинета
router.use(requireAuth);

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
