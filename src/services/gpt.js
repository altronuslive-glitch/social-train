/**
 * OpenAI Client — используем GPT-4o для текста и изображений.
 * GPT-4o (gpt-4o) — мультимодальная модель, читает текст + картинки.
 */

import OpenAI from 'openai';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY не установлен в переменных окружения');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

/**
 * Отправляет запрос к GPT-4o.
 * @param {object} params
 * @param {string} params.systemPrompt — system prompt
 * @param {string|array} params.userPrompt — user prompt (строка или массив для мультимодальности)
 * @param {string} [params.model] — модель (по умолчанию gpt-4o)
 * @param {number} [params.maxTokens] — максимум токенов ответа
 * @param {number} [params.temperature] — температура (0-2)
 * @returns {Promise<string>} текст ответа
 */
export async function callGPT({
  systemPrompt,
  userPrompt,
  model = 'gpt-4o',
  maxTokens = 4000,
  temperature = 0.7,
}) {
  const userMessage = typeof userPrompt === 'string'
    ? { role: 'user', content: userPrompt }
    : { role: 'user', content: userPrompt }; // userPrompt уже массив [{type: 'text'/'image_url', ...}]

  const response = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      userMessage,
    ],
    max_tokens: maxTokens,
    temperature,
  });

  return response.choices[0]?.message?.content || '';
}
