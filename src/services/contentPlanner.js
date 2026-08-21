import { callDeepSeek } from './deepseek.js';

/**
 * Генерирует план контента на месяц через DeepSeek
 * @param {object} params
 * @param {string} params.topic     — тема или описание бизнеса
 * @param {string} [params.audience] — целевая аудитория
 * @param {string} [params.tone]     — тон общения (friendly, professional, humorous...)
 * @param {string} [params.month]    — месяц для плана (например "сентябрь 2026")
 * @returns {Promise<object>} — структурированный план постов
 */
export async function generateContentPlan({ topic, audience, tone, month }) {
  const systemPrompt = `Ты — эксперт по SMM (управление социальными сетями) и контент-маркетингу.
Твоя задача — создавать детальные планы публикаций в социальных сетях.
Всегда отвечай в формате JSON с полем "posts" — массивом объектов.
Каждый пост содержит: week (неделя 1-4), day (день недели), topic (тема), caption (текст поста), hashtags (хэштеги), imagePrompt (промпт для генерации изображения на английском).`;

  const userPrompt = `Создай план контента на ${month || 'следующий месяц'}.
Тема / бизнес: ${topic}
Целевая аудитория: ${audience || 'широкая аудитория'}
Тон: ${tone || 'дружелюбный и профессиональный'}

Сгенерируй 20 постов, равномерно распределённых по 4 неделям (5 постов в неделю).
Верни только JSON, без лишнего текста.`;

  const raw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 4096,
  });

  // Парсим JSON из ответа DeepSeek
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('DeepSeek вернул невалидный JSON');

  return JSON.parse(jsonMatch[0]);
}
