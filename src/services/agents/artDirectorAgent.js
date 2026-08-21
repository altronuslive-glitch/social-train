/**
 * Art Director Agent — дотошный и вредный арт-директор.
 * Проверяет пост (текст + визуал) по жёстким критериям качества.
 * Без сантиментов: либо APPROVED, либо REJECTED с конкретными замечаниями.
 */

import { callDeepSeek } from '../deepseek.js';

/**
 * Проверяет пост и промпт. Возвращает вердикт.
 * @param {object} params
 * @param {object} params.smmResult    — результат SMM-агента
 * @param {object} params.imageResult  — результат Image-агента
 * @param {object} params.profile      — профиль страницы
 * @param {object} params.postIdea     — оригинальная идея поста
 * @returns {Promise<ReviewResult>}
 */
export async function reviewPost({ smmResult, imageResult, profile, postIdea }) {
  const systemPrompt = `Ты — арт-директор с 15-летним опытом в digital-маркетинге. Твоя репутация построена на том, что ты никогда не пропускаешь посредственный контент.

Твои принципы:
- Ты дотошен до занудства. Замечаешь всё: несоответствие тону, банальные формулировки, слабый визуал
- Ты безжалостен к клише и шаблонному мышлению
- Ты конструктивен: критикуешь конкретно, даёшь чёткие указания что исправить
- Ты понимаешь разницу между «мне не нравится» и «это объективно слабо»

Критерии оценки ТЕКСТА:
1. Соответствие tone of voice (0-25 баллов) — текст звучит как эта страница, а не как кто-то другой
2. Цепляющий заход (0-20 баллов) — первые 2 строки останавливают скролл
3. Ценность для аудитории (0-25 баллов) — польза, эмоция или инсайт
4. Отсутствие воды и клише (0-15 баллов) — каждое слово на месте
5. Призыв к действию / завершение (0-15 баллов) — пост не обрывается в никуда

Критерии оценки ВИЗУАЛА:
1. Соответствие концепции поста (0-25 баллов)
2. Конкретность промпта (0-25 баллов) — нейросеть поймёт точно
3. Уникальность и небанальность (0-25 баллов)
4. Технические параметры (0-25 баллов) — формат, aspect ratio, negatives

Порог прохождения: текст ≥ 70/100, визуал ≥ 70/100. Иначе — REJECTED.

Отвечай строго в формате JSON.`;

  const userPrompt = `Проверь этот пост для ВКонтакте.

ПРОФИЛЬ СТРАНИЦЫ:
- Ниша: ${profile.niche}
- Tone of voice: ${profile.toneOfVoice.summary}
- Что недопустимо: ${profile.toneOfVoice.forbiddenTone}
- Аудитория: ${profile.audience.portrait}

ИДЕЯ ПОСТА:
- Тема: ${postIdea.topic}
- Цель: ${postIdea.goal}
- День: ${postIdea.weekDay}

ТЕКСТ ПОСТА:
${smmResult.postText}

ПРОМПТ ДЛЯ ИЗОБРАЖЕНИЯ:
${imageResult.prompt}

НЕГАТИВНЫЙ ПРОМПТ:
${imageResult.negativePrompt}

БРИФ НА ВИЗУАЛ (от SMM):
Концепция: ${smmResult.imageBrief.concept}
Настроение: ${smmResult.imageBrief.mood}

Верни JSON:
{
  "verdict": "APPROVED" или "REJECTED",
  "textScore": 0-100,
  "imageScore": 0-100,
  "textIssues": ["замечание 1", "замечание 2"] или [],
  "imageIssues": ["замечание 1", "замечание 2"] или [],
  "fixInstructions": "конкретные инструкции что исправить (если REJECTED)",
  "artDirectorComment": "общий комментарий арт-директора (честно и по делу)"
}`;

  const raw = await callDeepSeek({
    systemPrompt,
    userPrompt,
    maxTokens: 1500,
  });

  // Находим первый JSON объект по скобкам
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) throw new Error('Art Director: невалидный JSON - не найдена открывающая скобка');

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

  if (jsonEnd === -1) throw new Error('Art Director: невалидный JSON - не найдена закрывающая скобка');

  const jsonString = raw.substring(jsonStart, jsonEnd);

  let result;
  try {
    result = JSON.parse(jsonString);
  } catch (parseError) {
    console.warn('Art Director: попытка исправить JSON...');

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
      console.log('✅ Art Director: JSON исправлен');
    } catch (fixError) {
      console.error('Art Director: raw response:', raw.substring(0, 500));
      throw new Error(`Art Director: не удалось исправить JSON. ${fixError.message}`);
    }
  }

  return result;
}
