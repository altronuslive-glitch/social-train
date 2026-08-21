/**
 * Telegram Parser — скрапит публичный канал через t.me/s/{channel}
 * Без токенов, без API. Работает с открытой веб-версией канала.
 *
 * Ограничение Telegram: веб-версия отдаёт последние ~20 постов за раз.
 * Для получения большего количества используем параметр ?before={id}.
 */

import * as cheerio from 'cheerio';

/**
 * Получает посты из публичного Telegram-канала.
 * @param {object} params
 * @param {string} params.channel — имя канала (без @, например "cvetidnya")
 * @param {number} [params.limit] — сколько постов собрать (по умолчанию 50)
 * @returns {Promise<TgPost[]>}
 */
export async function parseTelegramChannel({ channel, limit = 50 }) {
  const cleanChannel = channel
    .replace(/^https?:\/\/t\.me\//i, '')  // убираем https://t.me/
    .replace(/^@/, '')                     // убираем @
    .replace(/\/$/, '');                   // убираем слэш в конце

  const posts = [];
  let beforeId = null; // для пагинации: грузим посты старше этого ID

  while (posts.length < limit) {
    const url = beforeId
      ? `https://t.me/s/${cleanChannel}?before=${beforeId}`
      : `https://t.me/s/${cleanChannel}`;

    const resp = await fetch(url, {
      headers: {
        // Представляемся браузером — иначе Telegram может отдать редирект
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'ru-RU,ru;q=0.9',
      },
    });

    if (!resp.ok) {
      throw new Error(`Telegram вернул HTTP ${resp.status}. Проверь имя канала.`);
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    const batch = [];
    $('.tgme_widget_message').each((_, el) => {
      const $el = $(el);

      // ID поста — берём из data-post атрибута (формат "channel/123")
      const dataPost = $el.attr('data-post') || '';
      const postId = parseInt(dataPost.split('/')[1], 10);
      if (!postId) return;

      // Текст поста — удаляем вложенные теги, сохраняем переносы строк
      const $textEl = $el.find('.tgme_widget_message_text');
      // Заменяем <br> на \n перед извлечением текста
      $textEl.find('br').replaceWith('\n');
      const text = $textEl.text().trim();

      // Просмотры
      const viewsRaw = $el.find('.tgme_widget_message_views').text().trim();
      const views = parseViews(viewsRaw);

      // Дата
      const datetime = $el.find('time').attr('datetime') || null;

      // Есть ли фото/видео
      const hasPhoto = $el.find('.tgme_widget_message_photo').length > 0
        || $el.find('.tgme_widget_message_grouped_wrap').length > 0;
      const hasVideo = $el.find('.tgme_widget_message_video').length > 0
        || $el.find('.tgme_widget_message_roundvideo').length > 0;

      // Собираем URL картинок (если есть)
      const imageUrls = [];
      $el.find('.tgme_widget_message_photo_wrap').each((_, img) => {
        const style = $(img).attr('style') || '';
        const match = style.match(/background-image:url\('([^']+)'\)/);
        if (match) imageUrls.push(match[1]);
      });

      // Только посты с текстом
      if (text.length < 15) return;

      batch.push({
        id: postId,
        text,
        views,
        date: datetime,
        hasPhoto,
        hasVideo,
        imageUrls, // добавляем URLs картинок
      });
    });

    if (batch.length === 0) break; // больше постов нет

    posts.push(...batch);

    // Для следующей страницы берём минимальный ID из текущей пачки
    const minId = Math.min(...batch.map(p => p.id));
    if (minId === beforeId) break; // защита от бесконечного цикла
    beforeId = minId;

    // Небольшая пауза чтобы не получить rate limit
    await sleep(500);
  }

  return posts.slice(0, limit);
}

/** Парсит строку просмотров: "1.2K" → 1200, "26 views" → 26 */
function parseViews(raw) {
  const clean = raw.replace(/views?/i, '').trim();
  if (clean.endsWith('K')) return Math.round(parseFloat(clean) * 1000);
  if (clean.endsWith('M')) return Math.round(parseFloat(clean) * 1000000);
  return parseInt(clean, 10) || 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
