/**
 * Image Analyzer Agent — агент анализа визуального контента.
 * Анализирует изображения из постов через DeepSeek Vision и формирует
 * детальный документ о визуальном стиле, типах, категориях и методах применения.
 */

import { callDeepSeekVision, EFFORT } from '../deepseek.js';

/**
 * Сколько картинок отправляем на разбор.
 * Картинки — самая тяжёлая часть запроса и по времени скачивания, и по
 * объёму на входе модели, а стиль канала по десяти кадрам читается не
 * хуже, чем по двадцати.
 */
const MAX_ANALYZED_IMAGES = 10;

/**
 * Анализирует визуальное содержимое постов.
 * @param {object[]} posts — массив постов с imageUrls
 * @returns {Promise<ImageAnalysisResult>}
 */
export async function analyzeImageContent(posts) {
  // Берём посты с изображениями, сортируем по просмотрам
  const postsWithImages = posts
    .filter(p => p.imageUrls && p.imageUrls.length > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_ANALYZED_IMAGES);

  if (postsWithImages.length === 0) {
    return {
      hasImages: false,
      message: 'В канале нет постов с изображениями для анализа',
    };
  }

  // Формируем content для DeepSeek Vision
  const content = [
    {
      type: 'text',
      text: `Проанализируй визуальный контент этих ${postsWithImages.length} изображений из Telegram-канала.

Создай детальный документ с анализом:

1. ТИПЫ ИЗОБРАЖЕНИЙ (в процентах):
   - Фотографии (реальные снимки)
   - Иллюстрации (рисованные)
   - Инфографика (схемы, графики, данные)
   - Коллажи (комбинация элементов)
   - Скриншоты
   - Мемы
   - Другое

2. КАТЕГОРИИ КОНТЕНТА:
   - Что изображено (люди, продукты, природа, абстракция, текст, etc.)
   - Основные сюжеты

3. ФОРМАТЫ И КОМПОЗИЦИЯ:
   - Соотношения сторон (квадрат, вертикаль, горизонталь)
   - Композиция (центральная, правило третей, минимализм, насыщенность)
   - Планы (крупный, средний, общий)

4. ВИЗУАЛЬНЫЙ СТИЛЬ:
   - Цветовая палитра (конкретные цвета в HEX если возможно, или названия)
   - Настроение (уютное, энергичное, строгое, игривое, тревожное, вдохновляющее)
   - Освещение (яркое, мягкое, контрастное, тёмное)
   - Обработка (натуральная, фильтры, ретушь)

5. ВИЗУАЛЬНЫЕ ПАТТЕРНЫ:
   - Повторяющиеся элементы
   - Фирменный стиль (если есть)
   - Единство оформления

6. МЕТОДЫ ПРИМЕНЕНИЯ:
   - Наличие текста на изображениях (да/нет, где расположен)
   - Использование оверлеев (затемнение, градиенты)
   - Рамки, водяные знаки, логотипы
   - Специфические визуальные приёмы

7. ПРИМЕРЫ (опиши 3-5 наиболее показательных изображений):
   - Что на них изображено
   - Какую функцию выполняют
   - Почему они типичны для канала

Верни ответ строго в формате JSON:

{
  "hasImages": true,
  "imageTypes": {
    "photos": "процент или описание частоты",
    "illustrations": "...",
    "infographics": "...",
    "collages": "...",
    "screenshots": "...",
    "memes": "...",
    "other": "..."
  },
  "categories": ["категория 1", "категория 2", ...],
  "mainSubjects": ["что обычно изображено: тема 1", "тема 2", ...],
  "formats": {
    "aspectRatios": {
      "square": "процент",
      "vertical": "процент",
      "horizontal": "процент"
    },
    "composition": "описание типичной композиции",
    "typicalPlans": ["крупный план", "средний план", ...]
  },
  "visualStyle": {
    "colorPalette": ["#hex или название цвета 1", "цвет 2", ...],
    "dominantColors": ["основной цвет 1", "основной цвет 2"],
    "mood": "общее настроение визуала",
    "lighting": "характеристика освещения",
    "processing": "характер обработки изображений"
  },
  "patterns": [
    "повторяющийся элемент/паттерн 1",
    "паттерн 2",
    ...
  ],
  "brandIdentity": {
    "hasConsistentStyle": true/false,
    "description": "описание фирменного стиля если есть"
  },
  "usageMethods": {
    "textOnImages": true/false,
    "textPlacement": "где обычно располагается текст",
    "overlays": true/false,
    "overlayStyle": "описание оверлеев",
    "frames": true/false,
    "watermarks": true/false,
    "specialTechniques": ["техника 1", "техника 2", ...]
  },
  "examples": [
    {
      "description": "описание изображения",
      "purpose": "какую функцию выполняет",
      "typicality": "почему это типично для канала"
    }
  ],
  "recommendations": [
    "рекомендация 1 для будущих изображений",
    "рекомендация 2",
    ...
  ]
}`,
    },
  ];

  // Добавляем изображения
  for (const post of postsWithImages) {
    const imageUrl = post.imageUrls[0]; // берём первую картинку
    content.push({
      type: 'image_url',
      image_url: {
        url: imageUrl,
      },
    });
  }

  try {
    const visualAnalysisRaw = await callDeepSeekVision({
      systemPrompt: 'Ты — эксперт по визуальному дизайну, брендингу и фотографии с 15-летним опытом. Анализируешь визуальный контент и создаёшь детальные отчёты о стиле.',
      content,
      maxTokens: 3000,
      // Описание того, что видно на картинках, — задача наблюдения, а не
      // рассуждения. На high модель подолгу обдумывала очевидное.
      reasoningEffort: EFFORT.LOW,
    });

    const jsonMatch = visualAnalysisRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Image Analyzer: DeepSeek вернул невалидный JSON');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Добавляем метаинформацию
    analysis.meta = {
      analyzedImagesCount: postsWithImages.length,
      totalPostsWithImages: posts.filter(p => p.imageUrls?.length > 0).length,
      coverage: `${Math.round((postsWithImages.length / posts.length) * 100)}% постов содержат изображения`,
    };

    return analysis;

  } catch (error) {
    // Fallback: если DeepSeek Vision не работает, возвращаем базовый анализ
    console.warn('DeepSeek Vision недоступен, используем базовый анализ:', error.message);

    return {
      hasImages: true,
      imageTypes: { photos: 'неизвестно', note: 'Визуальный анализ недоступен (DeepSeek Vision не поддерживается)' },
      categories: ['Анализ изображений требует DeepSeek Vision API'],
      formats: { aspectRatios: {}, composition: 'неизвестно' },
      visualStyle: {
        colorPalette: [],
        mood: 'Для детального анализа требуется мультимодальная модель',
      },
      patterns: [],
      usageMethods: {},
      examples: [],
      recommendations: ['Добавьте поддержку DeepSeek Vision для детального анализа изображений'],
      meta: {
        analyzedImagesCount: postsWithImages.length,
        totalPostsWithImages: posts.filter(p => p.imageUrls?.length > 0).length,
        error: 'Vision API недоступен',
      },
    };
  }
}
