/**
 * Topic Generator — генератор тем для постов.
 * На основе карточки бренда создаёт 20 релевантных тем для будущих постов.
 */

import { callDeepSeek } from './deepseek.js';

/**
 * Генерирует темы для постов на основе карточки бренда.
 * @param {object} brandCard — карточка бренда из buildBrandCard()
 * @param {number} [count=20] — количество тем для генерации
 * @returns {Promise<{topics: Topic[], groups: Group[]}>}
 */
export async function generateTopics(brandCard, count = 20) {
  const systemPrompt = `Ты — контент-стратег с 10-летним опытом в SMM.

Твоя задача:
- Генерировать темы для постов, которые идеально соответствуют бренду
- Группировать темы по типам контента (FAQ, полезные советы, кейсы, и т.д.)
- Каждая тема должна решать конкретную задачу (вовлечение, экспертиза, эмоция, продажа)
- Темы должны быть разнообразными, но оставаться в рамках tone of voice

Отвечай строго в формате JSON.`;

  const contentTypesStr = brandCard.contentTypes
    ?.map(ct => `- ${ct.type} (${ct.frequency}): ${ct.goal}`)
    .join('\n') || 'не определены';

  const userPrompt = `Создай ${count} тем для постов на основе карточки бренда.
ВАЖНО: Сгруппируй темы по типам контента (каждая группа - это тип поста).

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
  "groups": [
    {
      "groupName": "FAQ",
      "groupDescription": "Часто задаваемые вопросы",
      "groupIcon": "❓",
      "topics": [
        {
          "id": 1,
          "title": "краткое название темы (3-7 слов)",
          "description": "детальное описание темы и что в ней раскрыть (2-3 предложения)",
          "contentType": "FAQ",
          "goal": "конкретная цель этого поста",
          "targetAudience": "кому из аудитории это особенно интересно",
          "visualSuggestion": "какой визуал подойдёт для этой темы",
          "keyMessage": "главная мысль, которую должен донести пост"
        }
      ]
    }
  ]
}

Типы групп контента (используй эти или похожие):
- FAQ (часто задаваемые вопросы)
- Полезные советы (лайфхаки, инструкции)
- Кейсы и истории (примеры из практики)
- Экспертиза (профессиональные знания)
- Развлечение (мемы, юмор, легкий контент)
- За кулисами (процессы, команда)
- Отзывы и результаты (социальные доказательства)
- Тренды (актуальное, новое)`;

  const topicsRaw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 4000, // увеличиваем для группированного формата
    temperature: 0.8,
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
      const topicsIndex = fixed.lastIndexOf('"topics"');
      const arrayStart = fixed.indexOf('[', topicsIndex);
      if (arrayStart !== -1) {
        fixed = fixed.replace(/\s*\}$/, '\n  ]\n}');
      }
    }

    // Пытаемся закрыть незавершенный массив groups
    if (fixed.includes('"groups"') && !fixed.includes(']')) {
      const groupsIndex = fixed.lastIndexOf('"groups"');
      const arrayStart = fixed.indexOf('[', groupsIndex);
      if (arrayStart !== -1) {
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

  // Преобразуем результат в единый формат
  let allTopics = [];
  let groups = [];

  if (result.groups && Array.isArray(result.groups)) {
    // Новый формат с группами
    let topicId = 1;
    groups = result.groups.map(group => {
      const groupTopics = (group.topics || []).map(topic => ({
        ...topic,
        id: topicId++,
        selected: false,
        generatedAt: new Date().toISOString(),
        groupName: group.groupName,
      }));
      allTopics.push(...groupTopics);

      return {
        groupName: group.groupName,
        groupDescription: group.groupDescription,
        groupIcon: group.groupIcon || '📄',
        topicCount: groupTopics.length,
        topics: groupTopics,
      };
    });
  } else if (result.topics && Array.isArray(result.topics)) {
    // Старый формат - группируем по contentType
    const topicsByType = {};

    result.topics.forEach((topic, index) => {
      const type = topic.contentType || 'Другое';
      if (!topicsByType[type]) {
        topicsByType[type] = [];
      }
      topicsByType[type].push({
        ...topic,
        id: index + 1,
        selected: false,
        generatedAt: new Date().toISOString(),
        groupName: type,
      });
    });

    // Создаем группы из типов
    groups = Object.entries(topicsByType).map(([type, topics]) => ({
      groupName: type,
      groupDescription: `Посты типа "${type}"`,
      groupIcon: getIconForType(type),
      topicCount: topics.length,
      topics,
    }));

    allTopics = result.topics.map((t, i) => ({
      ...t,
      id: i + 1,
      selected: false,
      generatedAt: new Date().toISOString(),
    }));
  }

  return { topics: allTopics, groups };
}

/**
 * Возвращает иконку для типа контента.
 */
function getIconForType(type) {
  const icons = {
    'FAQ': '❓',
    'полезный совет': '💡',
    'лайфхак': '⚡',
    'кейс': '📊',
    'личная история': '📖',
    'отзыв': '⭐',
    'за кулисами': '🎬',
    'тренд': '🔥',
    'челлендж': '🎯',
    'сравнение': '⚖️',
    'экспертиза': '🎓',
    'развлечение': '🎉',
  };

  return icons[type.toLowerCase()] || '📄';
}

/**
 * Создает fallback темы если DeepSeek вернул невалидный JSON.
 * @param {object} brandCard - карточка бренда
 * @param {number} count - количество тем
 * @returns {object} объект с groups
 */
function createFallbackTopics(brandCard, count) {
  const groupTemplates = [
    {
      groupName: 'FAQ',
      groupDescription: 'Часто задаваемые вопросы',
      groupIcon: '❓',
      baseGoal: 'закрыть возражения',
    },
    {
      groupName: 'Полезные советы',
      groupDescription: 'Практические советы и лайфхаки',
      groupIcon: '💡',
      baseGoal: 'дать пользу',
    },
    {
      groupName: 'Кейсы',
      groupDescription: 'Реальные примеры из практики',
      groupIcon: '📊',
      baseGoal: 'показать экспертизу',
    },
    {
      groupName: 'За кулисами',
      groupDescription: 'Процессы и команда',
      groupIcon: '🎬',
      baseGoal: 'создать близость',
    },
    {
      groupName: 'Тренды',
      groupDescription: 'Актуальное и новое',
      groupIcon: '🔥',
      baseGoal: 'показать актуальность',
    },
  ];

  const groups = [];
  let topicId = 1;
  const topicsPerGroup = Math.ceil(count / groupTemplates.length);

  groupTemplates.forEach(groupTemplate => {
    const groupTopics = [];

    for (let i = 0; i < topicsPerGroup && topicId <= count; i++) {
      groupTopics.push({
        id: topicId++,
        title: `${groupTemplate.groupName} #${i + 1}`,
        description: `Пост типа "${groupTemplate.groupName}" для аудитории: ${brandCard.audience?.portrait || 'целевая аудитория'}`,
        contentType: groupTemplate.groupName,
        goal: groupTemplate.baseGoal,
        targetAudience: brandCard.audience?.portrait || 'целевая аудитория',
        visualSuggestion: 'Релевантное изображение в соответствии с визуальным стилем бренда',
        keyMessage: `Основная мысль для темы "${groupTemplate.groupName}"`,
        selected: false,
        generatedAt: new Date().toISOString(),
        groupName: groupTemplate.groupName,
      });
    }

    if (groupTopics.length > 0) {
      groups.push({
        groupName: groupTemplate.groupName,
        groupDescription: groupTemplate.groupDescription,
        groupIcon: groupTemplate.groupIcon,
        topicCount: groupTopics.length,
        topics: groupTopics,
      });
    }
  });

  return { groups };
}
