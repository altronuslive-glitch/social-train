/**
 * Pipeline — главный оркестратор (v2).
 *
 * Новый workflow:
 * 1. Парсинг канала (30 постов)
 * 2. Параллельный анализ:
 *    - Агент текста → tone of voice документ
 *    - Агент изображений → визуальный стиль документ
 * 3. Формирование карточки бренда
 * 4. Генерация 20 тем для постов
 * 5. Генерация постов по выбранным темам (SMM Agent → Image Agent → Art Director)
 * 6. Генерация изображений через Grok (опционально)
 */

import { generatePost } from './agents/smmAgent.js';
import { generateImagePrompt } from './agents/imageAgent.js';
import { reviewPost } from './agents/artDirectorAgent.js';
import { analyzeTextContent } from './analyzers/textAnalyzer.js';
import { analyzeImageContent } from './analyzers/imageAnalyzer.js';
import { buildBrandCard } from './analyzers/brandCardBuilder.js';
import { generateTopics } from './topicGenerator.js';

const MAX_RETRIES = 2;

/**
 * Анализирует канал и формирует карточку бренда с темами.
 * @param {object[]} posts — массив постов из парсера
 * @param {function} [onProgress] — колбэк прогресса
 * @returns {Promise<{brandCard, topics}>}
 */
export async function analyzeChannelAndGenerateTopics(posts, onProgress) {
  console.log('📊 Этап 1: Параллельный анализ текста и изображений...');

  if (onProgress) onProgress({ step: 'text_analysis_start' });

  // Параллельно запускаем два агента анализа
  const [textAnalysis, imageAnalysis] = await Promise.all([
    (async () => {
      const result = await analyzeTextContent(posts);
      if (onProgress) onProgress({ step: 'text_analysis_complete', data: result });
      return result;
    })(),
    (async () => {
      if (onProgress) onProgress({ step: 'image_analysis_start' });
      const result = await analyzeImageContent(posts);
      if (onProgress) onProgress({ step: 'image_analysis_complete', data: result });
      return result;
    })(),
  ]);

  if (onProgress) onProgress({ step: 'analysis_complete', textAnalysis, imageAnalysis });

  console.log('✅ Анализ завершён');
  console.log(`   - Текст: проанализировано ${textAnalysis.meta?.analyzedPostsCount || 0} постов`);
  console.log(`   - Изображения: проанализировано ${imageAnalysis.meta?.analyzedImagesCount || 0} картинок`);

  console.log('\n🎨 Этап 2: Формирование карточки бренда...');
  if (onProgress) onProgress({ step: 'brand_card_start' });

  const brandCard = await buildBrandCard(textAnalysis, imageAnalysis);

  if (onProgress) onProgress({ step: 'brand_card_complete', brandCard });

  console.log('✅ Карточка бренда готова');
  console.log(`   - Ниша: ${brandCard.brand.niche}`);
  console.log(`   - Типов контента: ${brandCard.contentTypes?.length || 0}`);

  console.log('\n💡 Этап 3: Генерация тем для постов...');
  if (onProgress) onProgress({ step: 'topics_start' });

  const topics = await generateTopics(brandCard, 20);

  if (onProgress) onProgress({ step: 'topics_complete', topics });

  console.log('✅ Сгенерировано 20 тем для постов');

  return { brandCard, topics };
}

/**
 * Генерирует посты по выбранным темам.
 * @param {object} brandCard — карточка бренда
 * @param {object[]} selectedTopics — выбранные темы
 * @param {function} [onProgress] — колбэк прогресса
 * @returns {Promise<PostResult[]>}
 */
export async function generatePostsByTopics(brandCard, selectedTopics, onProgress) {
  console.log(`\n🤖 Этап 4: Генерация ${selectedTopics.length} постов...`);

  const results = [];

  for (let i = 0; i < selectedTopics.length; i++) {
    const topic = selectedTopics[i];
    console.log(`\n  ✍️  Пост ${i + 1}/${selectedTopics.length}: ${topic.title}`);

    const postResult = await processSinglePostFromTopic(brandCard, topic, i + 1);
    results.push(postResult);

    if (onProgress) onProgress({ step: 'post_generated', index: i + 1, total: selectedTopics.length, post: postResult });
  }

  return results;
}

/**
 * Запускает цепочку агентов для одного поста на основе темы.
 * @param {object} brandCard — карточка бренда
 * @param {object} topic — тема поста
 * @param {number} postNumber — номер поста
 * @returns {Promise<PostResult>}
 */
async function processSinglePostFromTopic(brandCard, topic, postNumber) {
  let feedback = null;
  let attempt = 0;
  let lastResult = null;

  // Формируем profile для совместимости со старыми агентами
  const profile = {
    niche: brandCard.brand.niche,
    description: brandCard.brand.description,
    toneOfVoice: brandCard.toneOfVoice,
    contentPatterns: {
      avgPostLength: 'средний',
      usesEmoji: true,
      usesHashtags: false,
      ...brandCard.contentGuidelines,
    },
    audience: brandCard.audience,
    visualAnalysis: {
      hasImages: brandCard.visualIdentity ? true : false,
      visualStyle: brandCard.visualIdentity?.summary || '',
    },
  };

  // Формируем postIdea из темы
  const postIdea = {
    topic: topic.title,
    goal: topic.goal,
    weekDay: 'День недели',
    description: topic.description,
    visualSuggestion: topic.visualSuggestion,
  };

  while (attempt < MAX_RETRIES) {
    attempt++;

    // 1. SMM Agent — пишет текст и бриф
    const smmResult = await generatePost({
      profile,
      postIdea,
      weekNumber: Math.ceil(postNumber / 5),
      feedback,
    });

    // 2. Image Agent — создаёт промпт для нейросети
    const imageResult = await generateImagePrompt({
      imageBrief: smmResult.imageBrief,
      profile,
    });

    // 3. Art Director — проверяет качество
    const review = await reviewPost({
      smmResult,
      imageResult,
      profile,
      postIdea,
    });

    lastResult = { smmResult, imageResult, review, attempt };

    if (review.verdict === 'APPROVED') {
      break;
    }

    // REJECTED — передаём замечания SMM-агенту для доработки
    feedback = review.fixInstructions;
    console.log(`  ↻ Пост отклонён (попытка ${attempt}): ${review.artDirectorComment}`);
  }

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    contentType: topic.contentType,
    goal: topic.goal,
    postText: lastResult.smmResult.postText,
    imageBrief: lastResult.smmResult.imageBrief,
    imagePrompt: lastResult.imageResult.prompt,
    negativePrompt: lastResult.imageResult.negativePrompt,
    aspectRatio: lastResult.imageResult.aspectRatio,
    alternativePrompt: lastResult.imageResult.alternativePrompt,
    artDirectorVerdict: lastResult.review.verdict,
    artDirectorComment: lastResult.review.artDirectorComment,
    textScore: lastResult.review.textScore,
    imageScore: lastResult.review.imageScore,
    attemptsUsed: lastResult.attempt,
  };
}

/**
 * Генерирует идеи для 20 постов (равномерно на 4 недели).
 * @param {object} profile — профиль страницы из analyzer
 * @returns {object[]} массив из 20 идей
 */
function buildPostIdeas(profile) {
  const weekDays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
  const goals = [
    'Повысить доверие к бренду',
    'Показать экспертизу',
    'Вызвать эмоцию и вовлечение',
    'Решить боль аудитории',
    'Развлечь и удержать внимание',
  ];

  // Берём топ-темы из анализа, если нет — используем универсальные
  const topics = profile.topics?.length
    ? profile.topics.map(t => t.name)
    : ['полезный совет', 'кейс из практики', 'отзыв клиента', 'за кулисами', 'тренд'];

  const ideas = [];
  for (let week = 1; week <= 4; week++) {
    for (let day = 0; day < 5; day++) {
      ideas.push({
        weekNumber: week,
        weekDay: weekDays[day],
        topic: topics[day % topics.length],
        goal: goals[day],
      });
    }
  }
  return ideas; // ровно 20
}

/**
 * Запускает цепочку агентов для одного поста.
 * @param {object} profile
 * @param {object} postIdea
 * @param {number} weekNumber
 * @returns {Promise<PostResult>}
 */
async function processSinglePost(profile, postIdea, weekNumber) {
  let feedback = null;
  let attempt = 0;
  let lastResult = null;

  while (attempt < MAX_RETRIES) {
    attempt++;

    // 1. SMM Agent — пишет текст и бриф
    const smmResult = await generatePost({
      profile,
      postIdea,
      weekNumber,
      feedback,
    });

    // 2. Image Agent — создаёт промпт для нейросети
    const imageResult = await generateImagePrompt({
      imageBrief: smmResult.imageBrief,
      profile,
    });

    // 3. Art Director — проверяет качество
    const review = await reviewPost({
      smmResult,
      imageResult,
      profile,
      postIdea,
    });

    lastResult = { smmResult, imageResult, review, attempt };

    if (review.verdict === 'APPROVED') {
      break;
    }

    // REJECTED — передаём замечания SMM-агенту для доработки
    feedback = review.fixInstructions;
    console.log(`  ↻ Пост отклонён (попытка ${attempt}): ${review.artDirectorComment}`);
  }

  return {
    week: weekNumber,
    day: postIdea.weekDay,
    topic: postIdea.topic,
    goal: postIdea.goal,
    postText: lastResult.smmResult.postText,
    imageBrief: lastResult.smmResult.imageBrief,
    imagePrompt: lastResult.imageResult.prompt,
    negativePrompt: lastResult.imageResult.negativePrompt,
    aspectRatio: lastResult.imageResult.aspectRatio,
    alternativePrompt: lastResult.imageResult.alternativePrompt,
    artDirectorVerdict: lastResult.review.verdict,
    artDirectorComment: lastResult.review.artDirectorComment,
    textScore: lastResult.review.textScore,
    imageScore: lastResult.review.imageScore,
    attemptsUsed: lastResult.attempt,
  };
}

/**
 * Главная функция — запускает весь пайплайн.
 * Посты генерируются параллельно по 5 штук (одна неделя),
 * чтобы не перегружать API и соблюдать порядок недель.
 *
 * @param {object} profile — профиль страницы из analyzer
 * @param {function} [onProgress] — колбэк прогресса (номер поста, всего)
 * @returns {Promise<PostResult[]>} массив из 20 постов
 */
export async function runPipeline(profile, onProgress) {
  const ideas = buildPostIdeas(profile);
  const results = [];

  // Обрабатываем по 5 постов (одна неделя) параллельно
  for (let week = 1; week <= 4; week++) {
    const weekIdeas = ideas.filter(i => i.weekNumber === week);

    console.log(`\n📅 Генерирую неделю ${week}...`);

    const weekResults = await Promise.all(
      weekIdeas.map(async (idea, idx) => {
        const globalIdx = (week - 1) * 5 + idx + 1;
        console.log(`  ✍️  Пост ${globalIdx}/20: ${idea.topic} (${idea.weekDay})`);

        const result = await processSinglePost(profile, idea, week);

        if (onProgress) onProgress(globalIdx, 20);
        return result;
      })
    );

    results.push(...weekResults);
  }

  return results;
}
