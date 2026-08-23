/**
 * Image Agent — специалист по генерации изображений.
 * Берёт бриф от SMM-агента и создаёт детальный промпт для нейросети
 * (совместим с Midjourney, DALL-E 3, Flux, Stable Diffusion).
 */

import { callDeepSeek, MODELS } from '../deepseek.js';

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
    // Задача — переложить готовый бриф в англоязычный промпт по заданному
    // шаблону. Рассуждающая Pro тратила на это отдельный долгий раунд,
    // хотя ничего нового не решает.
    model: MODELS.FLASH,
    maxTokens: 1500,
  });

  // Находим первый JSON объект по скобкам
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) throw new Error('Image Agent: невалидный JSON - не найдена открывающая скобка');

  // Ищем корректный конец JSON
  let depth = 0;
  let jsonEnd = -1;

  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    if (raw[i] === '}') {
      depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }

  if (jsonEnd === -1) throw new Error('Image Agent: невалидный JSON - не найдена закрывающая скобка');

  const jsonString = raw.substring(jsonStart, jsonEnd);

  let result;
  try {
    result = JSON.parse(jsonString);
  } catch (parseError) {
    console.warn('Image Agent: попытка исправить JSON...');

    let fixed = jsonString;
    fixed = fixed.replace(/,(\s*[\]}])/g, '$1');
    fixed = fixed.replace(/'([^']+)':/g, '"$1":');

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
      result = JSON.parse(fixed);
      console.log('✅ Image Agent: JSON исправлен');
    } catch (fixError) {
      console.error('Image Agent: raw response:', raw.substring(0, 500));
      throw new Error(`Image Agent: не удалось исправить JSON. ${fixError.message}`);
    }
  }

  return result;
}
