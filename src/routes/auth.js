/**
 * Route: /api/auth
 * Регистрация, вход по паролю, вход по кодовому слову, выход.
 */

import { Router } from 'express';
import {
  hashSecret,
  verifySecret,
  signSession,
  generatePassword,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '../services/auth.js';
import { createUser, findUserByLogin } from '../db/repositories.js';

const router = Router();

/** Открывает сессию: ставит куку и отдаёт пользователя. */
function startSession(res, user) {
  res.cookie(SESSION_COOKIE, signSession(user.id), SESSION_COOKIE_OPTIONS);
  return { id: user.id, login: user.login };
}

/**
 * GET /api/auth/generate-password
 * Отдаёт стойкий пароль для кнопки «Сгенерировать» в форме регистрации.
 */
router.get('/generate-password', (_req, res) => {
  res.json({ password: generatePassword() });
});

/**
 * GET /api/auth/me
 * Текущий пользователь или null.
 */
router.get('/me', (req, res) => {
  res.json({ user: req.user ? { id: req.user.id, login: req.user.login } : null });
});

/**
 * POST /api/auth/register
 * Body: { login, password, codeword }
 *
 * Логин не валидируется по составу символов — единственное требование,
 * чтобы он не был занят.
 */
router.post('/register', (req, res) => {
  const { login, password, codeword } = req.body;

  if (!login?.trim()) {
    return res.status(400).json({ error: 'Введите логин' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Введите пароль' });
  }
  if (!codeword?.trim()) {
    return res.status(400).json({ error: 'Введите кодовое слово' });
  }

  const cleanLogin = login.trim();

  if (findUserByLogin(cleanLogin)) {
    return res.status(409).json({ error: 'Такой логин уже занят' });
  }

  try {
    const user = createUser({
      login: cleanLogin,
      passwordHash: hashSecret(password),
      codewordHash: hashSecret(codeword.trim().toLowerCase()),
    });

    console.log(`👤 Зарегистрирован пользователь: ${cleanLogin}`);

    res.json({ success: true, user: startSession(res, user) });
  } catch (err) {
    // Гонка: логин мог занять другой запрос между проверкой и вставкой
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Такой логин уже занят' });
    }

    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Не удалось создать аккаунт' });
  }
});

/**
 * POST /api/auth/login
 * Body: { login, password }
 */
router.post('/login', (req, res) => {
  const { login, password } = req.body;

  if (!login?.trim() || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }

  const user = findUserByLogin(login.trim());

  if (!user || !verifySecret(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  res.json({ success: true, user: startSession(res, user) });
});

/**
 * POST /api/auth/login-codeword
 * Body: { login, codeword }
 * Вход для тех, кто забыл пароль.
 */
router.post('/login-codeword', (req, res) => {
  const { login, codeword } = req.body;

  if (!login?.trim() || !codeword?.trim()) {
    return res.status(400).json({ error: 'Введите логин и кодовое слово' });
  }

  const user = findUserByLogin(login.trim());

  if (!user || !verifySecret(codeword.trim().toLowerCase(), user.codeword_hash)) {
    return res.status(401).json({ error: 'Неверный логин или кодовое слово' });
  }

  res.json({ success: true, user: startSession(res, user) });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...SESSION_COOKIE_OPTIONS, maxAge: undefined });
  res.json({ success: true });
});

export default router;
