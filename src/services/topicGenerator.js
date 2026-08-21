/**
 * Topic Generator — генератор тем для постов.
 * На основе карточки бренда создаёт 20 релевантных тем для будущих постов.
 */

import { callDeepSeek } from './deepseek.js';

/**
 * Генерирует темы для постов на основе карточки бренда.
 * @param {object} brandCard — карточка бренда из buildBrandCard()
 * @param {number} [count=20] — количество тем для генерации
 * @returns {Promise<Topic[]>}
 */
export async function generateTopics(brandCard, count = 20) {
  const systemPrompt = `Ты — контент-стратег с 10-летним опытом в SMM.

Твоя задача:
- Генерировать темы для постов, которые идеально соответствуют бренду
- Каждая тема должна решать конкретную задачу (вовлечение, экспертиза, эмоция, продажа)
- Темы должны быть разнообразными, но оставаться в рамках tone of voice
- Учитывать типы контента, которые уже работают у этого бренда

Отвечай строго в формате JSON.`;

  const contentTypesStr = brandCard.contentTypes
    ?.map(ct => `- ${ct.type} (${ct.frequency}): ${ct.goal}`)
    .join('\n') || 'не определены';

  const userPrompt = `Создай ${count} тем для постов на основе карточки бренда.

БРЕНД:
- Ниша: ${brandCard.brand.niche}
- Описание: ${brandCard.brand.description}
- Уникальность: ${brandCard.brand.uniqueness}

TONE OF VOICE:
- Стиль: ${brandCard.toneOfVoice.summary}
- Язык: ${brandCard.toneOfVoice.language}
- Эмоциональность: ${brandCard.toneOfVoice.emotionality}
- Юмор: ${brandCard.toneOfVoice.humor}

АУДИТОРИЯ:
- Портрет: ${brandCard.audience.portrait}
- Боли: ${brandCard.audience.painPoints?.join(', ')}
- Желания: ${brandCard.audience.desires?.join(', ')}

ТИПЫ КОНТЕНТА (что уже работает):
${contentTypesStr}

ТРЕБОВАНИЯ:
1. Темы должны быть конкретными, не абстрактными
2. Каждая тема решает задачу аудитории или вызывает эмоцию
3. Разнообразие: распределить по типам контента равномерно
4. Учитывать сезонность и актуальность (текущая дата: ${new Date().toLocaleDateString('ru-RU')})
5. Темы должны быть реализуемы в формате поста для соцсетей

Верни JSON:
{
  "topics": [
    {
      "id": 1,
      "title": "краткое название темы (3-7 слов)",
      "description": "детальное описание темы и что в ней раскрыть (2-3 предложения)",
      "contentType": "тип контента из списка выше",
      "goal": "конкретная цель этого поста (вовлечь/обучить/продать/вдохновить/развлечь)",
      "targetAudience": "кому из аудитории это особенно интересно",
      "visualSuggestion": "какой визуал подойдёт для этой темы",
      "keyMessage": "главная мысль, которую должен донести пост"
    }
  ]
}`;

  const topicsRaw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 3500,
    temperature: 0.8, // выше температура для креативности
  });

  const jsonMatch = topicsRaw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Topic Generator: DeepSeek вернул невалидный JSON');
  }

  const result = JSON.parse(jsonMatch[0]);

  // Добавляем метаинформацию к каждой теме
  result.topics = result.topics.map(topic => ({
    ...topic,
    selected: false, // по умолчанию не выбрана
    generatedAt: new Date().toISOString(),
  }));

  return result.topics;
}
