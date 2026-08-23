/**
 * Точка входа: стартовый экран и запуск анализа.
 *
 * Генерация доступна только из аккаунта, но авторизацией пользователя
 * не встречают. Он вводит канал, жмёт «Анализировать» — и только тогда
 * появляется окно входа. Сразу после входа анализ продолжается сам.
 */

/**
 * Нажатие на «Анализировать канал».
 * Если пользователь не вошёл, запоминаем канал и показываем окно входа.
 */
async function startAnalysis() {
  const channel = document.getElementById('channel').value.trim();

  if (!channel) {
    alert('Введите ссылку на канал');
    return;
  }

  if (!state.user) {
    // Запоминаем — после входа анализ подхватится автоматически
    state.pendingChannel = channel;
    openAuthModal('register');
    return;
  }

  await runAnalysis(channel);
}

/**
 * Запускает анализ и открывает получившийся канал.
 * Прогресс показываем настоящий — сервер шлёт этапы по мере готовности.
 * @param {string} channel — адрес или имя канала
 */
async function runAnalysis(channel) {
  hideElement('errorCard');
  showScreen('loading');
  setProgress(0, 'Запуск анализа...');

  try {
    const { channelId } = await streamRequest(
      `/api/analyze/channel/stream?channel=${encodeURIComponent(channel)}`,
      ({ message, progress }) => setProgress(progress ?? 0, message),
    );

    setProgress(100, '✅ Готово!');
    await sleep(300);

    document.getElementById('channel').value = '';

    await openChannel(channelId);
  } catch (error) {
    showError(error.message);
  }
}

/** Стартовая инициализация вкладки. */
async function init() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
  } catch {
    state.user = null;
  }

  renderTopbar();

  // Вошедшего ведём в кабинет, гостя — на экран ввода канала
  if (state.user) {
    await goToDashboard();
  } else {
    showScreen('landing');
  }
}

document.addEventListener('DOMContentLoaded', init);
