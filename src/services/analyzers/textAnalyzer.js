/**
 * Text Analyzer Agent — агент анализа текстового контента.
 * Анализирует 30 постов и формирует детальный документ с tone of voice,
 * характеристиками, примерами и особенностями стиля общения.
 */

import { callDeepSeek } from '../deepseek.js';

/**
 * Анализирует текстовое содержимое постов.
 * @param {object[]} posts — массив постов из парсера
 * @returns {Promise<TextAnalysisResult>}
 */
export async function analyzeTextContent(posts) {
  // Берём топ-30 постов по просмотрам для анализа
  const topPosts = [...posts]
    .sort((a, b) => b.views - a.views)
    .slice(0, 30);

  const postsText = topPosts
    .map((p, i) => `[Пост ${i + 1}] (просмотров: ${p.views})\n${p.text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `Ты — эксперт по tone of voice (тон голоса бренда — уникальный стиль общения) и контент-аналитик с 10-летним опытом.

Твои навыки:
- Глубоко понимаешь психологию коммуникации и брендинга
- Выявляешь скрытые паттерны в текстах, которые формируют голос бренда
- Извлекаешь конкретные примеры из постов для иллюстрации каждой характеристики
- Создаёшь детальные руководства, по которым можно воссоздать этот же стиль

Всегда отвечай строго в формате JSON, без лишнего текста.`;

  const userPrompt = `Проанализируй эти 30 постов из Telegram-канала и создай детальный документ о tone of voice и контент-паттернах.

ВАЖНО: для каждой характеристики приводи конкретные примеры фраз из постов.

Верни JSON со следующей структурой:

{
  "niche": "ниша/сфера деятельности (1-3 слова)",
  "description": "краткое описание канала (2-3 предложения)",

  "toneOfVoice": {
    "summary": "общее описание голоса бренда (4-5 предложений с деталями)",
    "characteristics": [
      "характеристика 1 (например: дружелюбный и неформальный)",
      "характеристика 2 (например: использует профессиональный жаргон)",
      "характеристика 3",
      "характеристика 4",
      "характеристика 5"
    ],
    "examples": [
      {
        "characteristic": "название характеристики",
        "phrases": ["пример фразы 1 из постов", "пример фразы 2", "пример фразы 3"]
      }
    ],
    "language": "официальный / разговорный / смешанный / экспертный / молодёжный",
    "emotionality": "холодный / сдержанный / умеренный / эмоциональный / очень эмоциональный",
    "humor": "отсутствует / редкий / умеренный / частый / постоянный",
    "appeals": "как обращается к аудитории: ты/вы/мы/безличные конструкции",
    "forbiddenTone": "что категорически не подходит этому каналу (стили, формулировки, приёмы которых никогда не встречается)"
  },

  "contentPatterns": {
    "avgPostLength": "короткий (до 100 слов) / средний (100-300) / длинный (300-600) / очень длинный (600+)",
    "structure": "типичная структура поста (например: заголовок-вопрос + пояснение + призыв)",
    "usesEmoji": true/false,
    "emojiStyle": "не использует / редко / умеренно / часто / в каждом предложении",
    "usesHashtags": true/false,
    "usesFormatting": "описание форматирования (жирный, курсив, списки, абзацы)",
    "openingStyle": "как обычно начинаются посты (с вопроса, утверждения, истории, факта)",
    "closingStyle": "как обычно заканчиваются посты (призыв к действию, вопрос, резюме)",
    "bestPerformingType": "какой тип постов получает больше просмотров"
  },

  "topics": [
    {
      "name": "название темы",
      "frequency": "частота в % или как часто",
      "examples": ["заголовок поста 1", "заголовок поста 2"]
    }
  ],

  "audience": {
    "portrait": "детальный портрет целевой аудитории (возраст, пол, интересы, образ жизни)",
    "painPoints": ["боль/проблема 1", "боль 2", "боль 3"],
    "desires": ["желание/цель 1", "желание 2", "желание 3"],
    "expertiseLevel": "новички / средний уровень / эксперты / смешанная аудитория"
  },

  "uniqueFeatures": [
    "уникальная особенность 1 (то, что отличает этот канал от других в нише)",
    "уникальная особенность 2",
    "уникальная особенность 3"
  ]
}

Посты для анализа:

${postsText}`;

  const textAnalysisRaw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 4000,
  });

  const jsonMatch = textAnalysisRaw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Text Analyzer: DeepSeek вернул невалидный JSON');
  }

  let analysis;
  try {
    analysis = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    console.warn('Попытка исправить JSON от Text Analyzer...');

    let fixed = jsonMatch[0];

    // Удаляем trailing запятые
    fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

    // Пытаемся закрыть незакрытые массивы и объекты
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;

    // Закрываем незакрытые массивы
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixed = fixed.replace(/\s*$/, '\n]');
    }

    // Закрываем незакрытые объекты
    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixed = fixed.replace(/\s*$/, '\n}');
    }

    try {
      analysis = JSON.parse(fixed);
      console.log('✅ JSON успешно исправлен');
    } catch (fixError) {
      throw new Error(`Text Analyzer: Не удалось исправить JSON. Ошибка: ${fixError.message}`);
    }
  }

  // Добавляем метаинформацию
  analysis.meta = {
    analyzedPostsCount: topPosts.length,
    totalViews: topPosts.reduce((sum, p) => sum + p.views, 0),
    avgViews: Math.round(topPosts.reduce((sum, p) => sum + p.views, 0) / topPosts.length),
    dateRange: {
      from: topPosts[topPosts.length - 1]?.date,
      to: topPosts[0]?.date,
    },
  };

  return analysis;
}
