/**
 * Аутентификация: хеширование секретов и подпись сессий.
 * Всё на встроенном node:crypto — внешних библиотек не требуется.
 */

import {
  scryptSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  createHmac,
} from 'node:crypto';

/** Имя куки с сессией. */
export const SESSION_COOKIE = 'st_session';

/** Срок жизни сессии — 30 дней. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Секрет для подписи сессий.
 * Если SESSION_SECRET не задан, генерируем разовый — тогда сессии
 * не переживут перезапуск сервера, поэтому на проде переменную задать нужно.
 */
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  console.warn('⚠️  SESSION_SECRET не задан — сессии будут сбрасываться при каждом перезапуске');
  return randomBytes(32).toString('hex');
})();

/**
 * Хеширует пароль или кодовое слово.
 * Возвращает строку вида "соль:хеш" — соль у каждого секрета своя,
 * поэтому одинаковые пароли дают разные хеши.
 * @param {string} value
 * @returns {string}
 */
export function hashSecret(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(value, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Проверяет секрет против сохранённого хеша.
 * Сравнение через timingSafeEqual, чтобы по времени ответа нельзя было
 * подбирать секрет посимвольно.
 * @param {string} value — что ввёл пользователь
 * @param {string} stored — строка "соль:хеш" из базы
 * @returns {boolean}
 */
export function verifySecret(value, stored) {
  if (!value || !stored) return false;

  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  try {
    const candidate = scryptSync(value, salt, 64);
    const expected = Buffer.from(hash, 'hex');

    if (candidate.length !== expected.length) return false;

    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/**
 * Генерирует стойкий пароль для кнопки «Сгенерировать».
 * Без похожих друг на друга символов (0/O, 1/l/I), чтобы не путаться при переписывании.
 * @param {number} [length]
 * @returns {string}
 */
export function generatePassword(length = 16) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);

  let password = '';
  for (let i = 0; i < length; i++) {
    password += alphabet[bytes[i] % alphabet.length];
  }

  return password;
}

/**
 * Создаёт подписанный токен сессии.
 * Формат: base64(payload).подпись — подделать нельзя, не зная секрета.
 * @param {number} userId
 * @returns {string}
 */
export function signSession(userId) {
  const payload = {
    userId,
    sid: randomUUID(),
    exp: Date.now() + SESSION_TTL_MS,
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');

  return `${body}.${signature}`;
}

/**
 * Проверяет токен сессии.
 * @param {string} token
 * @returns {{userId: number}|null} null, если подпись не сходится или срок истёк
 */
export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;

  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');

  const given = Buffer.from(signature);
  const valid = Buffer.from(expected);

  if (given.length !== valid.length || !timingSafeEqual(given, valid)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));

    if (!payload.exp || payload.exp < Date.now()) return null;

    return { userId: payload.userId };
  } catch {
    return null;
  }
}

/** Настройки куки сессии. httpOnly — значит из JavaScript её не прочитать. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_MS,
  path: '/',
};
