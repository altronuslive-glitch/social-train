/**
 * Brand Card Builder — строитель карточки бренда.
 * Объединяет результаты анализа текста и изображений в единую карточку бренда
 * с типами постов, визуальными рекомендациями и руководством для генерации контента.
 */

import { callDeepSeek } from '../deepseek.js';

/**
 * Формирует карточку бренда на основе текстового и визуального анализа.
 * @param {object} textAnalysis — результат analyzeTextContent()
 * @param {object} imageAnalysis — результат analyzeImageContent()
 * @returns {Promise<BrandCard>}
 */
export async function buildBrandCard(textAnalysis, imageAnalysis) {
  const systemPrompt = `Ты — стратег бренда и контент-директор с 15-летним опытом.

Твоя задача:
- Объединить текстовый и визуальный анализ канала в единую карточку бренда
- Выделить типы контента с рекомендациями по тексту и визуалу для каждого типа
- Создать практическое руководство для генерации нового контента в этом стиле
- Сформулировать уникальность и позиционирование бренда

Отвечай строго в формате JSON.`;

  const userPrompt = `На основе текстового и визуального анализа Telegram-канала создай единую карточку бренда.

ТЕКСТОВЫЙ АНАЛИЗ:
${JSON.stringify(textAnalysis, null, 2)}

ВИЗУАЛЬНЫЙ АНАЛИЗ:
${JSON.stringify(imageAnalysis, null, 2)}

Верни JSON со следующей структурой:

{
  "brand": {
    "name": "название канала (если можно определить)",
    "niche": "ниша из анализа",
    "description": "описание из анализа",
    "uniqueness": "что делает этот канал уникальным (2-3 предложения)",
    "positioning": "как канал позиционируется в своей нише"
  },

  "toneOfVoice": {
    "summary": "из текстового анализа",
    "characteristics": [...],
    "examples": [...],
    "language": "...",
    "emotionality": "...",
    "humor": "...",
    "appeals": "...",
    "forbiddenTone": "..."
  },

  "visualIdentity": {
    "summary": "краткое описание визуального стиля (3-4 предложения)",
    "imageTypes": {...},
    "colorPalette": [...],
    "mood": "...",
    "patterns": [...],
    "usageMethods": {...}
  },

  "contentTypes": [
    {
      "type": "название типа поста (например: 'полезный совет', 'кейс', 'личная история')",
      "frequency": "как часто встречается",
      "textCharacteristics": "как пишутся такие посты (структура, tone, примеры фраз)",
      "visualRecommendation": "какие изображения подходят для этого типа постов",
      "goal": "какую цель преследует этот тип постов",
      "examples": ["пример заголовка 1", "пример 2"]
    }
  ],

  "audience": {
    "portrait": "из текстового анализа",
    "painPoints": [...],
    "desires": [...],
    "expertiseLevel": "..."
  },

  "contentGuidelines": {
    "doList": [
      "правило 1: что обязательно нужно делать",
      "правило 2",
      ...
    ],
    "dontList": [
      "запрет 1: чего категорически избегать",
      "запрет 2",
      ...
    ],
    "textRules": [
      "правило оформления текста 1",
      "правило 2",
      ...
    ],
    "visualRules": [
      "правило оформления визуала 1",
      "правило 2",
      ...
    ]
  },

  "artDirectorBrief": "Общее видение бренда для арт-директора: настроение, ценности, что важно сохранить при создании нового контента (4-5 предложений)"
}`;

  const brandCardRaw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 4000,
    temperature: 0.4,
  });

  const jsonMatch = brandCardRaw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Brand Card Builder: DeepSeek вернул невалидный JSON');
  }

  let brandCard;
  try {
    brandCard = JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    console.warn('Попытка исправить JSON от Brand Card Builder...');

    let fixed = jsonMatch[0];
    fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixed = fixed.replace(/\s*$/, '\n]');
    }

    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixed = fixed.replace(/\s*$/, '\n}');
    }

    try {
      brandCard = JSON.parse(fixed);
      console.log('✅ JSON успешно исправлен');
    } catch (fixError) {
      throw new Error(`Brand Card Builder: Не удалось исправить JSON. Ошибка: ${fixError.message}`);
    }
  }

  // Добавляем метаинформацию
  brandCard.meta = {
    createdAt: new Date().toISOString(),
    basedOn: {
      postsAnalyzed: textAnalysis.meta?.analyzedPostsCount || 0,
      imagesAnalyzed: imageAnalysis.meta?.analyzedImagesCount || 0,
    },
    version: '1.0',
  };

  return brandCard;
}
