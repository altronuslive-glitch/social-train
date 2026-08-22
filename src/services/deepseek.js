/**
 * DeepSeek Client — для генерации текстового контента.
 * Используется в агентах генерации (SMM, Image, Art Director) и в анализаторах.
 *
 * Модели (проверено на живом API — других у DeepSeek сейчас нет):
 *   deepseek-v4-pro              — рассуждения и анализ, БЕЗ поддержки изображений
 *   deepseek-v4-flash            — дешёвая и быстрая, для простых задач
 *   deepseek-v4-flash-vision-exp — единственная, которая принимает изображения
 *
 * ВАЖНО:
 * 1. Legacy-имя deepseek-chat всё ещё принимается, но API молча подменяет его
 *    на deepseek-v4-flash. Поэтому имена моделей задаются явно.
 * 2. Режим рассуждений у V4 включён ПО УМОЛЧАНИЮ, а в нём игнорируются
 *    temperature, top_p и штрафы. Управлять качеством нужно через
 *    reasoning_effort (low | high | max), поэтому temperature здесь не передаётся.
 */

import OpenAI from 'openai';
import { fetchImage } from './imageFetch.js';

/** Доступные модели DeepSeek. */
export const MODELS = {
  PRO: 'deepseek-v4-pro',
  FLASH: 'deepseek-v4-flash',
  VISION: 'deepseek-v4-flash-vision-exp',
};

/** Уровни усилий на рассуждение. medium/xhigh API принимает, но схлопывает в high. */
export const EFFORT = {
  LOW: 'low',
  HIGH: 'high',
  MAX: 'max',
};

/**
 * Запас токенов на сами рассуждения, сверх запрошенного объёма ответа.
 *
 * В режиме рассуждений max_tokens покрывает И размышления, И ответ. Если бюджета
 * не хватает, API возвращает finish_reason: "length" и обрезанный (часто вовсе
 * пустой) ответ — без ошибки, молча. Именно так ломался парсинг JSON.
 *
 * Расход крайне неравномерный: на коротком промпте это ~500 токенов, а на
 * реальном анализе 15 постов у v4-pro на effort=high замерено 7601. Поэтому
 * запас взят с большим перекрытием — max_tokens это потолок, а не цель,
 * и платим мы только за фактически сгенерированные токены.
 *
 * maxTokens у вызывающего кода означает «сколько нужно на сам ответ»,
 * а запас на рассуждения добавляется здесь.
 */
const REASONING_HEADROOM = {
  low: 8000,
  high: 16000,
  max: 32000,
};

let client = null;

function getClient() {
  if (!client) {
    // Пробуем разные названия переменных (Railway кеширует старые)
    const apiKey = process.env.DS_API_KEY || process.env.DEEPSEEK_KEY || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DS_API_KEY или DEEPSEEK_API_KEY не установлен в переменных окружения');
    }
    client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }
  return client;
}

/**
 * Отправляет запрос к DeepSeek.
 * @param {object} params
 * @param {string} params.systemPrompt — system prompt
 * @param {string} params.userPrompt   — user prompt
 * @param {string} [params.model]      — модель (по умолчанию deepseek-v4-pro)
 * @param {number} [params.maxTokens]  — максимум токенов ответа
 * @param {string} [params.reasoningEffort] — глубина рассуждений: low | high | max
 * @returns {Promise<string>} текст ответа
 */
export async function callDeepSeek({
  systemPrompt,
  userPrompt,
  model = MODELS.PRO,
  maxTokens = 4000,
  reasoningEffort = EFFORT.HIGH,
}) {
  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: withReasoningHeadroom(maxTokens, reasoningEffort),
    reasoning_effort: reasoningEffort,
  });

  return extractContent(response, model);
}

/**
 * Отправляет запрос к DeepSeek с поддержкой изображений (мультимодальность).
 *
 * Изображения по внешним ссылкам DeepSeek скачать НЕ может (отвечает
 * 400 "Failed to download image"), поэтому они предварительно выкачиваются
 * на нашей стороне и передаются как data:base64.
 *
 * @param {object} params
 * @param {string} params.systemPrompt — system prompt
 * @param {array} params.content       — массив блоков {type: 'text'/'image_url', ...}
 * @param {string} [params.model]      — модель (по умолчанию vision-модель)
 * @param {number} [params.maxTokens]  — максимум токенов ответа
 * @param {string} [params.reasoningEffort] — глубина рассуждений: low | high | max
 * @returns {Promise<string>} текст ответа
 */
export async function callDeepSeekVision({
  systemPrompt,
  content,
  model = MODELS.VISION,
  maxTokens = 4000,
  reasoningEffort = EFFORT.HIGH,
}) {
  const preparedContent = await inlineImages(content);

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: preparedContent },
    ],
    max_tokens: withReasoningHeadroom(maxTokens, reasoningEffort),
    reasoning_effort: reasoningEffort,
  });

  return extractContent(response, model);
}

/**
 * Добавляет к запрошенному объёму ответа запас на рассуждения.
 * @param {number} maxTokens — сколько токенов нужно на сам ответ
 * @param {string} effort — уровень рассуждений
 * @returns {number} лимит для max_tokens
 */
function withReasoningHeadroom(maxTokens, effort) {
  return maxTokens + (REASONING_HEADROOM[effort] ?? REASONING_HEADROOM.high);
}

/**
 * Достаёт текст ответа и явно ругается на обрыв по лимиту токенов,
 * иначе обрезанный ответ приходит пустой строкой и молча ломает парсинг JSON.
 * @param {object} response — ответ Chat Completions
 * @param {string} model — модель (для сообщения об ошибке)
 * @returns {string} текст ответа
 */
function extractContent(response, model) {
  const choice = response.choices?.[0];
  const content = choice?.message?.content || '';

  if (choice?.finish_reason === 'length') {
    const reasoningTokens = response.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    const answerTokens = (response.usage?.completion_tokens ?? 0) - reasoningTokens;

    // Пустой ответ — рассуждения съели весь бюджет, ответа нет вообще
    if (!content.trim()) {
      throw new Error(
        `DeepSeek (${model}) исчерпал лимит токенов на рассуждениях (${reasoningTokens} токенов) ` +
        'и не успел выдать ответ. Увеличьте maxTokens или снизьте reasoningEffort.'
      );
    }

    // Непустой, но обрезанный — JSON почти наверняка битый, парсер упадёт ниже
    console.warn(
      `⚠️  DeepSeek (${model}): ответ обрезан по лимиту токенов ` +
      `(рассуждения ${reasoningTokens}, ответ ${answerTokens}). JSON может быть невалидным — увеличьте maxTokens.`
    );
  }

  return content;
}

/** Максимальный размер одной картинки, байт. Более тяжёлые пропускаем. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Суммарный бюджет на все картинки в запросе, байт (до кодирования в base64). */
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * Заменяет блоки image_url с внешними ссылками на data:base64.
 * Картинки, которые не удалось скачать, выбрасываются из запроса,
 * чтобы одна битая ссылка не роняла весь анализ.
 * @param {array} content — исходные блоки
 * @returns {Promise<array>} блоки, готовые к отправке
 */
async function inlineImages(content) {
  if (!Array.isArray(content)) return content;

  const prepared = [];
  let totalBytes = 0;
  let skipped = 0;

  for (const block of content) {
    if (block?.type !== 'image_url') {
      prepared.push(block);
      continue;
    }

    const url = block.image_url?.url;

    // Уже base64 — оставляем как есть
    if (!url || url.startsWith('data:')) {
      prepared.push(block);
      continue;
    }

    if (totalBytes >= MAX_TOTAL_IMAGE_BYTES) {
      skipped++;
      continue;
    }

    const image = await fetchImageAsDataUrl(url);

    if (!image) {
      skipped++;
      continue;
    }

    totalBytes += image.bytes;
    prepared.push({ ...block, image_url: { ...block.image_url, url: image.dataUrl } });
  }

  if (skipped > 0) {
    console.warn(`⚠️  Vision: пропущено изображений — ${skipped} (не скачались или превышен лимит размера)`);
  }

  return prepared;
}

/**
 * Скачивает изображение и кодирует его в data:base64.
 * @param {string} url — ссылка на изображение
 * @returns {Promise<{dataUrl: string, bytes: number}|null>} null, если скачать не удалось
 */
async function fetchImageAsDataUrl(url) {
  const image = await fetchImage(url, { maxBytes: MAX_IMAGE_BYTES });

  if (!image) return null;

  return {
    dataUrl: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
    bytes: image.buffer.length,
  };
}
