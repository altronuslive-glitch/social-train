/**
 * Image Agent — специалист по генерации изображений.
 * Берёт бриф от SMM-агента и создаёт детальный промпт для нейросети
 * (совместим с Midjourney, DALL-E 3, Flux, Stable Diffusion).
 */

import { callDeepSeek } from '../deepseek.js';

/**
 * Превращает бриф в готовый промпт для нейросети.
 * @param {object} params
 * @param {object} params.imageBrief  — бриф из SMM-агента
 * @param {object} params.profile     — профиль страницы
 * @param {string} [params.target]    — целевая нейросеть: "midjourney" | "dalle" | "flux"
 * @returns {Promise<ImageResult>}
 */
export async function generateImagePrompt({ imageBrief, profile, target = 'flux' }) {
  const systemPrompt = `Ты — топовый специалист по промпт-инжинирингу (созданию текстовых инструкций для нейросетей) для генерации изображений.

Твои знания:
- Знаешь все ключевые слова и теги для ${target} наизусть
- Понимаешь, как нейросеть интерпретирует каждое слово
- Умеешь добиваться точного результата с первой попытки
- Строишь промпт по принципу: главный объект → окружение → свет → стиль → техника → параметры

Правила:
- Промпт на английском языке (нейросети лучше понимают английский)
- Избегай абстрактных слов вроде "beautiful", "amazing" — они ничего не значат для нейросети
- Используй конкретные визуальные дескрипторы
- Negative prompt — обязательно, чтобы исключить типичные артефакты

Отвечай строго в формате JSON.`;

  const userPrompt = `Создай промпт для генерации изображения в ${target}.

БРИФ ОТ SMM-СПЕЦИАЛИСТА:
- Концепция: ${imageBrief.concept}
- Настроение: ${imageBrief.mood}
- Композиция: ${imageBrief.composition}
- Цветовая палитра: ${imageBrief.colorPalette}
- Стиль: ${imageBrief.style}
- Текст на картинке: ${imageBrief.textOnImage || 'нет'}
- Не включать: ${imageBrief.doNotInclude}

КОНТЕКСТ БРЕНДА:
- Ниша: ${profile.niche}
- Аудитория: ${profile.audience.portrait}

Верни JSON:
{
  "prompt": "готовый промпт на английском для ${target}",
  "negativePrompt": "negative prompt — что исключить (на английском)",
  "aspectRatio": "1:1 | 4:5 | 16:9 | 9:16",
  "styleNotes": "пояснение — почему выбраны именно эти визуальные решения",
  "alternativePrompt": "запасной вариант промпта если основной не даст нужного результата"
}`;

  const raw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
  });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Image Agent: невалидный JSON');

  return JSON.parse(jsonMatch[0]);
}
