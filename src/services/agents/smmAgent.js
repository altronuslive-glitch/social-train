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

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('SMM Agent: невалидный JSON');

  return JSON.parse(jsonMatch[0]);
}
