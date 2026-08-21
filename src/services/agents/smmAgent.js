/**
 * SMM Agent — топовый SMM-специалист.
 * Пишет текст поста в точном соответствии с tone of voice страницы
 * и создаёт подробный бриф для художника/дизайнера.
 */

import { callDeepSeek } from '../deepseek.js';

/**
 * Генерирует один пост: текст + бриф на картинку.
 * @param {object} params
 * @param {object} params.profile    — профиль страницы из analyzer
 * @param {object} params.postIdea   — идея поста { topic, weekDay, goal }
 * @param {number} params.weekNumber — номер недели (1-4)
 * @param {string} [params.feedback] — замечания арт-директора (при переработке)
 * @returns {Promise<SmmResult>}
 */
export async function generatePost({ profile, postIdea, weekNumber, feedback }) {
  const tov = profile.toneOfVoice;

  const systemPrompt = `Ты — топовый SMM-специалист с 10-летним опытом. Специализируешься на ВКонтакте.

Твои сильные стороны:
- Пишешь тексты, которые ТОЧНО попадают в tone of voice бренда — не отходишь от него ни на шаг
- Создаёшь цепляющие заходы (первые 2 строки) — они должны остановить скролл
- Каждый пост решает конкретную задачу аудитории или вызывает эмоцию
- Никогда не пишешь «воду» — каждое предложение несёт смысл
- Даёшь исчерпывающий бриф на визуал — дизайнер должен понять всё без звонка

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Использовать клише: «мы рады сообщить», «команда профессионалов», «высокое качество»
- Писать в стиле, который противоречит tone of voice: ${tov.forbiddenTone}
- Делать пост ради поста — должна быть польза или эмоция

Отвечай строго в формате JSON, без лишнего текста.`;

  const userPrompt = `Напиши пост для ВКонтакте.

ПРОФИЛЬ СТРАНИЦЫ:
- Ниша: ${profile.niche}
- Описание: ${profile.description}
- Tone of voice: ${tov.summary}
- Характеристики голоса: ${tov.characteristics.join(', ')}
- Язык: ${tov.language}
- Эмоциональность: ${tov.emotionality}
- Юмор: ${tov.humor}
- Обращение: ${tov.appeals}
- Длина постов: ${profile.contentPatterns.avgPostLength}
- Эмодзи: ${profile.contentPatterns.usesEmoji ? 'да, использовать' : 'нет, не использовать'}

АУДИТОРИЯ:
- Портрет: ${profile.audience.portrait}
- Боли: ${profile.audience.painPoints.join(', ')}
- Желания: ${profile.audience.desires.join(', ')}

ЗАДАНИЕ:
- Неделя: ${weekNumber} из 4
- День недели: ${postIdea.weekDay}
- Тема поста: ${postIdea.topic}
- Цель поста: ${postIdea.goal}
${feedback ? `\nЗАМЕЧАНИЯ АРТ-ДИРЕКТОРА (ОБЯЗАТЕЛЬНО УЧТИ):\n${feedback}` : ''}

Верни JSON:
{
  "postText": "готовый текст поста для публикации",
  "imageBrief": {
    "concept": "концепция визуала — что должно быть изображено и почему",
    "mood": "настроение и атмосфера картинки",
    "composition": "как расположены элементы, что на переднем плане",
    "colorPalette": "цветовая гамма (конкретные цвета)",
    "style": "реалистичная фотография / иллюстрация / инфографика / коллаж / другое",
    "textOnImage": "текст на картинке (или null если не нужен)",
    "doNotInclude": "что точно не должно быть на картинке"
  },
  "reasoning": "коротко — почему именно такой подход для этой темы и аудитории"
}`;

  const raw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 2000,
  });

  // Находим первый JSON объект
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) throw new Error('SMM Agent: невалидный JSON - не найдена открывающая скобка');

  // Ищем корректный конец JSON, игнорируя текст после него
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

  if (jsonEnd === -1) throw new Error('SMM Agent: невалидный JSON - не найдена закрывающая скобка');

  const jsonString = raw.substring(jsonStart, jsonEnd);

  let result;
  try {
    result = JSON.parse(jsonString);
  } catch (parseError) {
    console.warn('SMM Agent: попытка исправить JSON...');

    let fixed = jsonString;

    // Удаляем trailing запятые
    fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

    // Исправляем одинарные кавычки на двойные
    fixed = fixed.replace(/'([^']+)':/g, '"$1":');

    // Закрываем незакрытые структуры
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
      console.log('✅ SMM Agent: JSON исправлен');
    } catch (fixError) {
      console.error('SMM Agent: raw response:', raw.substring(0, 500));
      throw new Error(`SMM Agent: не удалось исправить JSON. ${fixError.message}`);
    }
  }

  return result;
}
