/**
 * Claude Client — для анализа картинок и мультимодального контента.
 * Используется только в analyzer для чтения изображений из постов.
 */

import Anthropic from '@anthropic-ai/sdk';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY не установлен в переменных окружения');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Отправляет запрос к Claude с поддержкой изображений.
 * @param {object} params
 * @param {string} params.systemPrompt — system prompt
 * @param {array} params.content       — массив блоков {type: 'text'/'image', ...}
 * @param {string} [params.model]      — модель (по умолчанию claude-sonnet-4)
 * @param {number} [params.maxTokens]  — максимум токенов ответа
 * @returns {Promise<string>} текст ответа
 */
export async function callClaude({
  systemPrompt,
  content,
  model = 'claude-sonnet-4',
  maxTokens = 4000,
}) {
  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  return response.content[0]?.text || '';
}
