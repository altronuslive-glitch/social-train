/**
 * Функции доступа к данным.
 *
 * Всё, что относится к каналам и постам, принимает userId и проверяет
 * принадлежность записи — чтобы по чужому id ничего не отдавалось
 * и не редактировалось.
 */

import { getDb } from './index.js';

/** JSON.parse, который не падает на пустом или битом значении. */
function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ─────────────────────────────── Пользователи ───────────────────────────────

/**
 * Создаёт пользователя.
 * @param {object} params
 * @param {string} params.login
 * @param {string} params.passwordHash
 * @param {string} params.codewordHash
 * @returns {{id: number, login: string}}
 * @throws если логин занят (UNIQUE)
 */
export function createUser({ login, passwordHash, codewordHash }) {
  const result = getDb()
    .prepare('INSERT INTO users (login, password_hash, codeword_hash) VALUES (?, ?, ?)')
    .run(login, passwordHash, codewordHash);

  return { id: Number(result.lastInsertRowid), login };
}

/**
 * Ищет пользователя по логину.
 * @param {string} login
 * @returns {object|undefined}
 */
export function findUserByLogin(login) {
  return getDb().prepare('SELECT * FROM users WHERE login = ?').get(login);
}

/**
 * Ищет пользователя по id.
 * @param {number} id
 * @returns {object|undefined}
 */
export function findUserById(id) {
  return getDb().prepare('SELECT id, login, created_at FROM users WHERE id = ?').get(id);
}

// ───────────────────────────────── Каналы ─────────────────────────────────

/**
 * Список каналов пользователя — для карточек на главной кабинета.
 * @param {number} userId
 * @returns {object[]}
 */
export function listChannels(userId) {
  const rows = getDb()
    .prepare(`
      SELECT c.id, c.handle, c.title, c.analyzed_posts_count, c.created_at, c.updated_at,
             (SELECT COUNT(*) FROM posts p WHERE p.channel_id = c.id) AS posts_count,
             (SELECT COUNT(*) FROM posts p WHERE p.channel_id = c.id AND p.image_path IS NOT NULL) AS images_count
      FROM channels c
      WHERE c.user_id = ?
      ORDER BY c.updated_at DESC
    `)
    .all(userId);

  return rows.map(row => ({ ...row }));
}

/**
 * Сохраняет результат анализа как новый канал.
 * @param {number} userId
 * @param {object} data — { handle, title, brandCard, topics, groups, analyzedPostsCount }
 * @returns {number} id созданного канала
 */
export function createChannel(userId, { handle, title, brandCard, topics, groups, analyzedPostsCount }) {
  const result = getDb()
    .prepare(`
      INSERT INTO channels (user_id, handle, title, brand_card, topics, groups, analyzed_posts_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      userId,
      handle,
      title || handle,
      JSON.stringify(brandCard ?? null),
      JSON.stringify(topics ?? []),
      JSON.stringify(groups ?? []),
      analyzedPostsCount || 0,
    );

  return Number(result.lastInsertRowid);
}

/**
 * Отдаёт канал целиком вместе с постами. Чужой канал вернёт null.
 * @param {number} userId
 * @param {number} channelId
 * @returns {object|null}
 */
export function getChannel(userId, channelId) {
  const row = getDb()
    .prepare('SELECT * FROM channels WHERE id = ? AND user_id = ?')
    .get(channelId, userId);

  if (!row) return null;

  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    brandCard: parseJson(row.brand_card),
    topics: parseJson(row.topics, []),
    groups: parseJson(row.groups, []),
    analyzedPostsCount: row.analyzed_posts_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    posts: listPosts(channelId),
  };
}

/**
 * Проверяет, что канал принадлежит пользователю.
 * @param {number} userId
 * @param {number} channelId
 * @returns {boolean}
 */
export function ownsChannel(userId, channelId) {
  const row = getDb()
    .prepare('SELECT id FROM channels WHERE id = ? AND user_id = ?')
    .get(channelId, userId);
  return Boolean(row);
}

/**
 * Сохраняет отредактированную карточку бренда.
 * @param {number} userId
 * @param {number} channelId
 * @param {object} brandCard
 * @returns {boolean} false, если канал чужой или не найден
 */
export function updateBrandCard(userId, channelId, brandCard) {
  const result = getDb()
    .prepare(`
      UPDATE channels SET brand_card = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `)
    .run(JSON.stringify(brandCard), channelId, userId);

  return result.changes > 0;
}

/**
 * Сохраняет сгенерированные темы.
 * @param {number} userId
 * @param {number} channelId
 * @param {object[]} topics
 * @param {object[]} groups
 * @returns {boolean}
 */
export function updateTopics(userId, channelId, topics, groups) {
  const result = getDb()
    .prepare(`
      UPDATE channels SET topics = ?, groups = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `)
    .run(JSON.stringify(topics ?? []), JSON.stringify(groups ?? []), channelId, userId);

  return result.changes > 0;
}

/**
 * Удаляет канал вместе с постами (каскадом).
 * @param {number} userId
 * @param {number} channelId
 * @returns {boolean}
 */
export function deleteChannel(userId, channelId) {
  const result = getDb()
    .prepare('DELETE FROM channels WHERE id = ? AND user_id = ?')
    .run(channelId, userId);

  return result.changes > 0;
}

// ───────────────────────────────── Посты ─────────────────────────────────

/**
 * Посты канала по порядку.
 * @param {number} channelId
 * @returns {object[]}
 */
export function listPosts(channelId) {
  const rows = getDb()
    .prepare('SELECT * FROM posts WHERE channel_id = ? ORDER BY position, id')
    .all(channelId);

  return rows.map(row => ({
    id: row.id,
    topicId: row.topic_id,
    topicTitle: row.topic_title,
    postText: row.post_text,
    imagePrompt: row.image_prompt,
    negativePrompt: row.negative_prompt,
    aspectRatio: row.aspect_ratio,
    imageUrl: row.image_path ? `/media/${row.image_path}` : null,
    position: row.position,
  }));
}

/**
 * Добавляет сгенерированные посты в конец списка канала.
 * @param {number} channelId
 * @param {object[]} posts — посты из пайплайна
 * @returns {object[]} сохранённые посты
 */
export function addPosts(channelId, posts) {
  const db = getDb();

  const maxPosition = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS max FROM posts WHERE channel_id = ?')
    .get(channelId).max;

  const insert = db.prepare(`
    INSERT INTO posts (channel_id, topic_id, topic_title, post_text, image_prompt, negative_prompt, aspect_ratio, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  posts.forEach((post, index) => {
    insert.run(
      channelId,
      post.topicId ?? null,
      post.topicTitle ?? null,
      post.postText ?? '',
      post.imagePrompt ?? null,
      post.negativePrompt ?? null,
      post.aspectRatio ?? '1:1',
      maxPosition + 1 + index,
    );
  });

  db.prepare("UPDATE channels SET updated_at = datetime('now') WHERE id = ?").run(channelId);

  return listPosts(channelId);
}

/**
 * Находит пост вместе с владельцем — для проверки прав.
 * @param {number} userId
 * @param {number} postId
 * @returns {object|undefined}
 */
export function getPostForUser(userId, postId) {
  return getDb()
    .prepare(`
      SELECT p.* FROM posts p
      JOIN channels c ON c.id = p.channel_id
      WHERE p.id = ? AND c.user_id = ?
    `)
    .get(postId, userId);
}

/**
 * Сохраняет отредактированный текст поста.
 * @param {number} userId
 * @param {number} postId
 * @param {string} postText
 * @returns {boolean}
 */
export function updatePostText(userId, postId, postText) {
  if (!getPostForUser(userId, postId)) return false;

  getDb()
    .prepare("UPDATE posts SET post_text = ?, updated_at = datetime('now') WHERE id = ?")
    .run(postText, postId);

  return true;
}

/**
 * Привязывает к посту сохранённую картинку.
 * @param {number} userId
 * @param {number} postId
 * @param {string} imagePath — имя файла внутри MEDIA_DIR
 * @returns {boolean}
 */
export function setPostImage(userId, postId, imagePath) {
  if (!getPostForUser(userId, postId)) return false;

  getDb()
    .prepare("UPDATE posts SET image_path = ?, updated_at = datetime('now') WHERE id = ?")
    .run(imagePath, postId);

  return true;
}
