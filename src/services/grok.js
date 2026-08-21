/**
 * Grok API Client — для генерации изображений через xAI Grok.
 * Документация: https://docs.x.ai/api
 */

import OpenAI from 'openai';

/**
 * Генерирует изображение через Grok API.
 * @param {object} params
 * @param {string} params.prompt — промпт для генерации
 * @param {string} params.apiKey — Grok API ключ (xai-...)
 * @param {string} [params.model] — модель (по умолчанию grok-vision или другая)
 * @param {string} [params.size] — размер изображения (1024x1024, 1024x1792, 1792x1024)
 * @param {number} [params.n] — количество изображений (1-4)
 * @returns {Promise<string[]>} массив URL сгенерированных изображений
 */
export async function generateImage({
  prompt,
  apiKey,
  model = 'grok-2-vision-1212', // предполагаемое имя модели
  size = '1024x1024',
  n = 1,
}) {
  if (!apiKey) {
    throw new Error('Grok API key не предоставлен');
  }

  // Создаём клиент OpenAI, но с baseURL для Grok API
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1', // предполагаемый endpoint
  });

  try {
    // Используем Chat Completions API (как у OpenAI DALL-E)
    // Если у Grok есть отдельный images endpoint, нужно будет адаптировать
    const response = await client.images.generate({
      model,
      prompt,
      n,
      size,
    });

    return response.data.map(img => img.url);
  } catch (error) {
    // Если images endpoint не существует, пробуем через chat
    console.warn('Grok images API недоступен, пробуем через chat:', error.message);

    try {
      const chatResponse = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an image generation assistant. Generate images based on user prompts.',
          },
          {
            role: 'user',
            content: `Generate an image: ${prompt}`,
          },
        ],
      });

      // Извлекаем URL из ответа (формат зависит от API Grok)
      const content = chatResponse.choices[0]?.message?.content;

      // Пытаемся найти URL в ответе
      const urlMatch = content?.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp)/gi);

      if (urlMatch) {
        return urlMatch;
      }

      throw new Error('Не удалось извлечь URL изображения из ответа Grok');
    } catch (chatError) {
      throw new Error(`Grok API error: ${chatError.message}`);
    }
  }
}

/**
 * Генерирует изображение с дополнительными параметрами.
 * @param {object} params
 * @param {string} params.prompt — основной промпт
 * @param {string} [params.negativePrompt] — negative prompt (что исключить)
 * @param {string} params.apiKey — Grok API ключ
 * @param {string} [params.aspectRatio] — соотношение сторон (1:1, 16:9, 9:16, 4:5)
 * @returns {Promise<string>} URL сгенерированного изображения
 */
export async function generateImageAdvanced({
  prompt,
  negativePrompt,
  apiKey,
  aspectRatio = '1:1',
}) {
  // Конвертируем aspect ratio в размер
  const sizeMap = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:5': '1024x1280',
    '5:4': '1280x1024',
  };

  const size = sizeMap[aspectRatio] || '1024x1024';

  // Если есть negative prompt, добавляем его к основному промпту
  const fullPrompt = negativePrompt
    ? `${prompt}\n\nAvoid: ${negativePrompt}`
    : prompt;

  const urls = await generateImage({
    prompt: fullPrompt,
    apiKey,
    size,
    n: 1,
  });

  return urls[0];
}

/**
 * Проверяет работоспособность Grok API ключа.
 * @param {string} apiKey — ключ для проверки
 * @returns {Promise<boolean>} true если ключ валидный
 */
export async function testGrokApiKey(apiKey) {
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    });

    // Пробуем простой запрос
    await client.models.list();
    return true;
  } catch (error) {
    console.error('Grok API key test failed:', error.message);
    return false;
  }
}
