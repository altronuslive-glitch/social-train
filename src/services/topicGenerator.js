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

  // Улучшенная обработка JSON - иногда DeepSeek добавляет текст после JSON
  let jsonMatch = topicsRaw.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('Topic Generator: DeepSeek вернул невалидный JSON');
  }

  let result;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    // Пытаемся исправить типичные ошибки DeepSeek
    console.warn('Попытка исправить JSON от DeepSeek...');

    let fixed = jsonMatch[0];

    // Удаляем trailing запятые перед ] или }
    fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

    // Пытаемся закрыть незавершенный массив topics
    if (fixed.includes('"topics"') && !fixed.includes(']')) {
      // Находим последнюю открывающую скобку массива
      const topicsIndex = fixed.lastIndexOf('"topics"');
      const arrayStart = fixed.indexOf('[', topicsIndex);
      if (arrayStart !== -1) {
        // Добавляем закрывающую скобку массива перед закрывающей скобкой объекта
        fixed = fixed.replace(/\s*\}$/, '\n  ]\n}');
      }
    }

    try {
      result = JSON.parse(fixed);
      console.log('✅ JSON успешно исправлен');
    } catch (fixError) {
      // Если всё равно не парсится - создаем fallback темы
      console.error('Не удалось исправить JSON, используем fallback темы');
      result = createFallbackTopics(brandCard, count);
    }
  }

  // Добавляем метаинформацию к каждой теме
  result.topics = result.topics.map(topic => ({
    ...topic,
    selected: false, // по умолчанию не выбрана
    generatedAt: new Date().toISOString(),
  }));

  return result.topics;
}

/**
 * Создает fallback темы если DeepSeek вернул невалидный JSON.
 * @param {object} brandCard - карточка бренда
 * @param {number} count - количество тем
 * @returns {object[]} массив fallback тем
 */
function createFallbackTopics(brandCard, count) {
  const baseTopics = [
    { type: 'полезный совет', goal: 'обучить' },
    { type: 'личная история', goal: 'вовлечь' },
    { type: 'кейс', goal: 'показать экспертизу' },
    { type: 'отзыв', goal: 'повысить доверие' },
    { type: 'за кулисами', goal: 'создать близость' },
    { type: 'FAQ', goal: 'закрыть возражения' },
    { type: 'тренд', goal: 'показать актуальность' },
    { type: 'челлендж', goal: 'вовлечь' },
    { type: 'лайфхак', goal: 'дать пользу' },
    { type: 'сравнение', goal: 'помочь выбрать' },
  ];

  const topics = [];
  for (let i = 0; i < count; i++) {
    const base = baseTopics[i % baseTopics.length];
    topics.push({
      id: i + 1,
      title: `${base.type} #${Math.floor(i / baseTopics.length) + 1}`,
      description: `Пост типа "${base.type}" для аудитории: ${brandCard.audience?.portrait || 'целевая аудитория'}`,
      contentType: base.type,
      goal: base.goal,
      targetAudience: brandCard.audience?.portrait || 'целевая аудитория',
      visualSuggestion: 'Релевантное изображение в соответствии с визуальным стилем бренда',
      keyMessage: `Основная мысль для темы "${base.type}"`
    });
  }

  return { topics };
}
