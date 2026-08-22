/**
 * Middleware аутентификации (промежуточные обработчики запроса).
 *
 * attachUser  — мягкий: есть валидная сессия, кладём пользователя в req.user
 * requireAuth — жёсткий: нет пользователя, отдаём 401
 */

import { SESSION_COOKIE, verifySession } from '../services/auth.js';
import { findUserById } from '../db/repositories.js';

/**
 * Разбирает заголовок Cookie в объект.
 * Отдельная библиотека ради шести строк не нужна.
 * @param {string} header — значение заголовка Cookie
 * @returns {Record<string, string>}
 */
function parseCookies(header) {
  const result = {};
  if (!header) return result;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (name) result[name] = decodeURIComponent(value);
  }

  return result;
}

/**
 * Кладёт в req.user текущего пользователя, если сессия валидна.
 * Запрос не блокирует — на публичных страницах пользователь может отсутствовать.
 */
export function attachUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies[SESSION_COOKIE]);

  if (session) {
    const user = findUserById(session.userId);
    if (user) req.user = user;
  }

  next();
}

/**
 * Пропускает дальше только авторизованных.
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Необходим вход в аккаунт' });
  }

  next();
}
