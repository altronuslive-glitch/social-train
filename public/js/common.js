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

/**
 * Читает потоковый эндпоинт (SSE) до финального события.
 *
 * Обычным запросом такие операции не сделать: анализ идёт около шести минут,
 * а шлюз Railway рвёт запрос примерно на пятой и отдаёт 502 — хотя сервер
 * работу доводит до конца. Поток же не простаивает, и рвать его нечему.
 *
 * Сессия едет в куке, которую браузер подставляет сам, — заголовки тут
 * задать нельзя, но они и не нужны.
 *
 * @param {string} url — GET-адрес потокового эндпоинта
 * @param {(event: {message: string, progress?: number}) => void} onProgress
 * @returns {Promise<object>} поле data из финального события
 */
function streamRequest(url, onProgress) {
  return new Promise((resolve, reject) => {
    const source = new EventSource(url);
    let settled = false;

    const settle = (finish, value) => {
      if (settled) return;
      settled = true;
      source.close();
      finish(value);
    };

    source.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // мусор в потоке игнорируем, ждём следующее событие
      }

      if (data.step === 'complete') {
        settle(resolve, data.data);
      } else if (data.step === 'error') {
        settle(reject, new Error(data.message));
      } else {
        onProgress(data);
      }
    };

    // Закрыть соединение здесь обязательно: сам по себе EventSource
    // переподключается молча и запустил бы всю генерацию заново.
    source.onerror = async () => {
      settle(reject, new Error(await describeStreamFailure()));
    };
  });
}

/**
 * Уточняет причину обрыва потока.
 *
 * Через EventSource текст ошибки не прочитать — браузер отдаёт только сам
 * факт обрыва. Но самая частая причина, истёкшая сессия, проверяется
 * отдельным запросом: без неё сервер закрывает поток сразу, ещё до работы.
 *
 * @returns {Promise<string>} текст для пользователя
 */
async function describeStreamFailure() {
  try {
    const { user } = await api('/api/auth/me');

    if (!user) {
      // Приводим интерфейс в согласие с сервером: шапка снова покажет «Войти»
      state.user = null;
      renderTopbar();
      return 'Сессия истекла — войдите заново.';
    }
  } catch {
    // до сервера не достучались — значит дело точно не в сессии
  }

  return 'Соединение с сервером прервалось. Попробуйте ещё раз.';
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
