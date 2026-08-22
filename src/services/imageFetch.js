/**
 * Общая загрузка изображений по ссылке.
 * Используется и анализатором картинок (нужен base64), и хранилищем
 * постов (нужен файл на диске) — логика скачивания одна на двоих.
 */

/** Таймаут на скачивание одной картинки, мс. */
const FETCH_TIMEOUT_MS = 15000;

/** Ограничение по умолчанию на размер картинки, байт. */
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Скачивает изображение.
 * @param {string} url — ссылка на изображение
 * @param {object} [options]
 * @param {number} [options.maxBytes] — предел размера; больше — считаем неудачей
 * @returns {Promise<{buffer: Buffer, mimeType: string}|null>} null при любой неудаче
 */
export async function fetchImage(url, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // Некоторые CDN отдают 403 без правдоподобного User-Agent
        'User-Agent': 'Mozilla/5.0 (compatible; social-train/1.0)',
      },
    });

    if (!response.ok) {
      console.warn(`⚠️  Не удалось скачать изображение (${response.status}): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) return null;

    if (buffer.length > maxBytes) {
      console.warn(`⚠️  Изображение слишком большое (${Math.round(buffer.length / 1024)} КБ): ${url}`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    const mimeType = contentType?.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';

    return { buffer, mimeType };
  } catch (error) {
    console.warn(`⚠️  Ошибка загрузки изображения ${url}: ${error.message}`);
    return null;
  }
}

/** Соответствие MIME-типа расширению файла. */
const EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Подбирает расширение файла по MIME-типу.
 * @param {string} mimeType
 * @returns {string}
 */
export function extensionFor(mimeType) {
  return EXTENSIONS[mimeType] || '.jpg';
}
