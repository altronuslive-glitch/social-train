/**
 * Общие утилиты: состояние приложения, переключение экранов, запросы к API.
 */

/** Текущее состояние вкладки. */
const state = {
  user: null,          // { id, login } или null
  channel: null,       // открытый канал целиком
  pendingChannel: null, // адрес канала, который ждёт входа
};

/** Все экраны приложения — показываем строго по одному. */
const SCREENS = ['landing', 'loading', 'dashboard', 'channelView', 'errorCard'];

function showElement(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function hideElement(id) {
  document.getElementById(id)?.classList.add('hidden');
}

/**
 * Показывает один экран, прячет остальные.
 * @param {string} id
 */
function showScreen(id) {
  SCREENS.forEach(screen => hideElement(screen));
  showElement(id);
}

/**
 * Экранирует текст перед вставкой в HTML.
 * Без этого угловые скобки в тексте поста ломают вёрстку.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Запрос к нашему API.
 * @param {string} url
 * @param {object} [options] — { method, body }
 * @returns {Promise<object>} разобранный JSON
 * @throws Error с текстом от сервера
 */
async function api(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // тело не JSON — оставляем пустой объект
  }

  if (!response.ok) {
    throw new Error(data.error || `Ошибка ${response.status}`);
  }

  return data;
}

function showError(message) {
  document.getElementById('errorText').textContent = message;
  showScreen('errorCard');
}

function setProgress(percent, text) {
  document.getElementById('progressFill').style.width = `${percent}%`;
  document.getElementById('loadingText').textContent = text;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Возвращает на стартовый экран. */
function goToLanding() {
  showScreen('landing');
}

/** Сбрасывает состояние и возвращает туда, где пользователю есть что делать. */
function resetApp() {
  state.channel = null;
  if (state.user) {
    goToDashboard();
  } else {
    showScreen('landing');
  }
}
