/**
 * Analyzer — анализирует посты, извлекает tone of voice, темы, стиль.
 * DeepSeek анализирует текст и tone of voice.
 * Claude анализирует изображения отдельно.
 */

import { callDeepSeek } from './deepseek.js';
import { callClaude } from './claude.js';

/**
 * Анализирует изображения через Claude (мультимодальный анализ).
 * @param {object[]} posts — посты с imageUrls
 * @returns {Promise<object>} — общая характеристика визуального стиля
 */
async function analyzeImages(posts) {
  // Берём топ-10 постов с картинками
  const postsWithImages = posts
    .filter(p => p.imageUrls && p.imageUrls.length > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  if (postsWithImages.length === 0) {
    return {
      hasImages: false,
      visualStyle: 'Изображений в постах нет',
    };
  }

  // Формируем content для Claude с картинками
  const content = [
    {
      type: 'text',
      text: `Проанализируй визуальный стиль этих изображений из Telegram-канала.
Опиши:
- Общую стилистику (фотографии, иллюстрации, коллажи, инфографика)
- Цветовую палитру (тёплые/холодные, яркие/приглушённые, доминирующие цвета)
- Композицию (минимализм, насыщенность, крупные планы, панорамы)
- Настроение картинок (уютное, энергичное, строгое, игривое)
- Повторяющиеся визуальные паттерны

Ответь коротко, 3-5 предложений.`,
    },
  ];

  // Добавляем картинки (максимум 10)
  for (const post of postsWithImages.slice(0, 10)) {
    const imageUrl = post.imageUrls[0]; // берём первую картинку из поста
    content.push({
      type: 'image',
      source: {
        type: 'url',
        url: imageUrl,
      },
    });
  }

  const visualAnalysis = await callClaude({
    systemPrompt: 'Ты — эксперт по визуальному дизайну и брендингу. Анализируешь стиль изображений.',
    content,
    maxTokens: 1000,
  });

  return {
    hasImages: true,
    visualStyle: visualAnalysis,
    analyzedImagesCount: postsWithImages.length,
  };
}

/**
 * Анализирует массив постов и возвращает профиль страницы.
 * @param {object[]} posts — массив постов из парсера
 * @returns {Promise<PageProfile>}
 */
export async function analyzePage(posts) {
  // Берём топ-30 постов по просмотрам для анализа текста
  const topPosts = [...posts]
    .sort((a, b) => b.views - a.views)
    .slice(0, 30);

  const postsText = topPosts
    .map((p, i) => `[Пост ${i + 1}] (просмотров: ${p.views})\n${p.text}`)
    .join('\n\n---\n\n');

  // 1. DeepSeek анализирует текст и tone of voice
  const textAnalysisRaw = await callDeepSeek({
    systemPrompt: `Ты — аналитик контента и эксперт по tone of voice (голос бренда — уникальный стиль общения).
Анализируешь посты из соцсетей и создаёшь детальный профиль страницы.
Всегда отвечай строго в формате JSON, без лишнего текста.`,
    userPrompt: `Проанализируй эти посты из Telegram и верни JSON со следующей структурой:

{
  "niche": "ниша / сфера деятельности (1-2 слова)",
  "description": "краткое описание страницы (2-3 предложения)",
  "toneOfVoice": {
    "summary": "общее описание голоса бренда (3-4 предложения)",
    "characteristics": ["характеристика 1", "характеристика 2", ...],
    "language": "официальный / разговорный / смешанный / экспертный",
    "emotionality": "холодный / нейтральный / эмоциональный / очень эмоциональный",
    "humor": "нет / редко / умеренно / часто",
    "appeals": "как обращается к аудитории (ты/вы/мы)",
    "forbiddenTone": "что категорически не подходит этой странице"
  },
  "topics": [
    { "name": "название темы", "frequency": "частота в %", "examples": "пример из постов" }
  ],
  "contentPatterns": {
    "avgPostLength": "короткий до 100 слов / средний 100-300 / длинный 300+",
    "usesEmoji": true/false,
    "usesHashtags": true/false,
    "structurePattern": "как обычно устроен пост (зачин, тело, призыв к действию)",
    "bestPerformingType": "какой тип постов получает больше всего реакций"
  },
  "audience": {
    "portrait": "портрет целевой аудитории (возраст, интересы, боли)",
    "painPoints": ["боль 1", "боль 2"],
    "desires": ["желание 1", "желание 2"]
  }
}

Посты для анализа:

${postsText}`,
    maxTokens: 3000,
  });

  const jsonMatch = textAnalysisRaw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Analyzer: DeepSeek вернул невалидный JSON');

  const profile = JSON.parse(jsonMatch[0]);

  // 2. Claude анализирует изображения (если есть)
  const imageAnalysis = await analyzeImages(posts);

  // Добавляем визуальный анализ в профиль
  profile.visualAnalysis = imageAnalysis;

  return profile;
}
