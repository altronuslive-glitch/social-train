/**
 * Grok API Client — для генерации изображений через xAI Grok.
 * Документация: https://docs.x.ai/api
 *
 * Формат запроса (проверен на живом API):
 *   POST https://api.x.ai/v1/images/generations
 *   { model, prompt, n, aspect_ratio, resolution, quality, response_format }
 *
 * ВАЖНО: xAI НЕ принимает параметр `size` (как у DALL-E) — вернёт
 * 400 "Argument not supported: size". Размер задаётся через
 * `aspect_ratio` + `resolution`.
 */

const XAI_IMAGES_URL = 'https://api.x.ai/v1/images/generations';
const XAI_MODELS_URL = 'https://api.x.ai/v1/models';

/** Модель по умолчанию. Альтернативы: grok-imagine-image-2.0, grok-imagine-image-quality */
const DEFAULT_MODEL = 'grok-imagine-image';

/** Соотношения сторон, которые принимает xAI. */
const SUPPORTED_ASPECT_RATIOS = new Set([
  '1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2',
  '9:19.5', '19.5:9', '9:20', '20:9', '1:2', '2:1', '21:9', '5:2', 'auto',
]);

/** Соотношения из UI, которых нет у xAI → ближайший поддерживаемый аналог. */
const ASPECT_RATIO_FALLBACK = {
  '4:5': '3:4',
  '5:4': '4:3',
};

/** Максимальная длина промпта у image-моделей xAI. */
const MAX_PROMPT_LENGTH = 8000;

/**
 * Приводит соотношение сторон к значению, которое понимает xAI.
 * @param {string} aspectRatio
 * @returns {string}
 */
function normalizeAspectRatio(aspectRatio) {
  if (!aspectRatio) return '1:1';
  if (SUPPORTED_ASPECT_RATIOS.has(aspectRatio)) return aspectRatio;
  return ASPECT_RATIO_FALLBACK[aspectRatio] || '1:1';
}

/**
 * Генерирует изображение через Grok API.
 * @param {object} params
 * @param {string} params.prompt — промпт для генерации
 * @param {string} params.apiKey — Grok API ключ (xai-...)
 * @param {string} [params.model] — модель (по умолчанию grok-imagine-image)
 * @param {string} [params.aspectRatio] — соотношение сторон (1:1, 16:9, 9:16, ...)
 * @param {string} [params.resolution] — разрешение: 1k | 2k
 * @param {string} [params.quality] — качество: low | medium | high
 * @param {number} [params.n] — количество изображений (1-10)
 * @returns {Promise<string[]>} массив URL сгенерированных изображений
 */
export async function generateImage({
  prompt,
  apiKey,
  model = DEFAULT_MODEL,
  aspectRatio = '1:1',
  resolution = '1k',
  quality = 'medium',
  n = 1,
}) {
  if (!apiKey) {
    throw new Error('Grok API key не предоставлен');
  }

  if (!prompt) {
    throw new Error('Промпт для генерации изображения пустой');
  }

  const response = await fetch(XAI_IMAGES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, MAX_PROMPT_LENGTH),
      n,
      aspect_ratio: normalizeAspectRatio(aspectRatio),
      resolution,
      quality,
      response_format: 'url',
    }),
  });

  const rawBody = await response.text();

  if (!response.ok) {
    // xAI отдаёт ошибки либо как JSON {code, error}, либо как plain text
    let message = rawBody;
    try {
      const parsed = JSON.parse(rawBody);
      message = parsed.error?.message || parsed.error || parsed.message || rawBody;
    } catch {
      // оставляем текст как есть
    }
    throw new Error(`Grok API error: ${response.status} ${message}`);
  }

  const data = JSON.parse(rawBody);
  const urls = (data.data || []).map(img => img.url).filter(Boolean);

  if (urls.length === 0) {
    throw new Error('Grok API вернул ответ без URL изображений');
  }

  return urls;
}

/**
 * Генерирует изображение с дополнительными параметрами.
 * @param {object} params
 * @param {string} params.prompt — основной промпт
 * @param {string} [params.negativePrompt] — negative prompt (что исключить)
 * @param {string} params.apiKey — Grok API ключ
 * @param {string} [params.aspectRatio] — соотношение сторон (1:1, 16:9, 9:16, 4:5)
 * @param {string} [params.model] — модель xAI
 * @returns {Promise<string>} URL сгенерированного изображения
 */
export async function generateImageAdvanced({
  prompt,
  negativePrompt,
  apiKey,
  aspectRatio = '1:1',
  model = DEFAULT_MODEL,
}) {
  // У xAI нет отдельного поля negative prompt — дописываем его в основной промпт
  const fullPrompt = negativePrompt
    ? `${prompt}\n\nAvoid: ${negativePrompt}`
    : prompt;

  const urls = await generateImage({
    prompt: fullPrompt,
    apiKey,
    model,
    aspectRatio,
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
  if (!apiKey) return false;

  try {
    const response = await fetch(XAI_MODELS_URL, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    return response.ok;
  } catch (error) {
    console.error('Grok API key test failed:', error.message);
    return false;
  }
}
