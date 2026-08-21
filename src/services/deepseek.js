/**
 * DeepSeek Client — для генерации текстового контента.
 * Используется в агентах генерации (SMM, Image, Art Director).
 * v2: fixed env loading
 */

import OpenAI from 'openai';

let client = null;

function getClient() {
  if (!client) {
    // Пробуем разные названия переменных (Railway кеширует старые)
    const apiKey = process.env.DS_API_KEY || process.env.DEEPSEEK_KEY || process.env.DEEPSEEK_API_KEY;
    console.log('🔑 Available env vars:', Object.keys(process.env).filter(k => k.includes('DEEP') || k.includes('DS_')));
    console.log('🔑 Using API Key (first 10 chars):', apiKey ? apiKey.substring(0, 10) : 'NOT_FOUND');
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
 * @param {string} [params.model]      — модель (по умолчанию deepseek-chat)
 * @param {number} [params.maxTokens]  — максимум токенов ответа
 * @param {number} [params.temperature] — температура (0-2)
 * @returns {Promise<string>} текст ответа
 */
export async function callDeepSeek({
  systemPrompt,
  userPrompt,
  model = 'deepseek-chat',
  maxTokens = 4000,
  temperature = 0.7,
}) {
  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Отправляет запрос к DeepSeek с поддержкой изображений (мультимодальность).
 * @param {object} params
 * @param {string} params.systemPrompt — system prompt
 * @param {array} params.content       — массив блоков {type: 'text'/'image_url', ...}
 * @param {string} [params.model]      — модель (по умолчанию deepseek-chat)
 * @param {number} [params.maxTokens]  — максимум токенов ответа
 * @param {number} [params.temperature] — температура (0-2)
 * @returns {Promise<string>} текст ответа
 */
export async function callDeepSeekVision({
  systemPrompt,
  content,
  model = 'deepseek-chat',
  maxTokens = 4000,
  temperature = 0.7,
}) {
  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ],
    max_tokens: maxTokens,
    temperature,
  });

  return response.choices[0]?.message?.content || '';
}
