/**
 * Хранилище картинок постов.
 *
 * Grok отдаёт картинки по временным ссылкам (в адресе прямо стоит tmp),
 * поэтому для сохранённых постов мы выкачиваем файл к себе и дальше
 * раздаём его со своего адреса /media/... — иначе картинки у старых
 * постов однажды просто перестанут открываться.
 */

import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { MEDIA_DIR } from '../db/index.js';
import { fetchImage, extensionFor } from './imageFetch.js';

/**
 * Скачивает картинку и кладёт её в каталог media.
 * @param {string} url — временная ссылка от Grok
 * @returns {Promise<string>} имя файла внутри MEDIA_DIR
 * @throws если скачать не удалось
 */
export async function persistImage(url) {
  const image = await fetchImage(url);

  if (!image) {
    throw new Error('Не удалось сохранить изображение: файл не скачался');
  }

  const fileName = `${randomUUID()}${extensionFor(image.mimeType)}`;

  await writeFile(path.join(MEDIA_DIR, fileName), image.buffer);

  return fileName;
}

/**
 * Удаляет файл картинки. Отсутствие файла ошибкой не считается.
 * @param {string} fileName — имя файла внутри MEDIA_DIR
 * @returns {Promise<void>}
 */
export async function removeImage(fileName) {
  if (!fileName) return;

  try {
    await unlink(path.join(MEDIA_DIR, fileName));
  } catch {
    // файла уже нет — это нормально
  }
}
