/**
 * Вход и регистрация.
 *
 * Ключевая деталь сценария: если пользователь нажал «Анализировать канал»
 * не войдя, адрес канала запоминается в state.pendingChannel, и сразу после
 * успешного входа анализ запускается сам — повторно нажимать кнопку не нужно.
 */

/** Открывает модалку. */
function openAuthModal(tab = 'login') {
  clearAuthError();
  switchAuthTab(tab);
  showElement('authModal');
}

/** Закрывает модалку. Запомненный адрес канала при этом не теряется. */
function closeAuthModal() {
  hideElement('authModal');
  clearAuthError();
}

/** Переключает вкладку «Вход» / «Регистрация». */
function switchAuthTab(tab) {
  const isLogin = tab === 'login';

  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);

  document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
  document.getElementById('registerForm').classList.toggle('hidden', isLogin);

  clearAuthError();
}

/** Прячет поле пароля и показывает кодовое слово. */
function switchToCodeword() {
  hideElement('loginPasswordGroup');
  showElement('loginCodewordGroup');
  document.getElementById('loginSubmit').textContent = 'Войти по кодовому слову';
  clearAuthError();
}

/** Возвращает поле пароля на место. */
function switchToPassword() {
  showElement('loginPasswordGroup');
  hideElement('loginCodewordGroup');
  document.getElementById('loginSubmit').textContent = 'Войти';
  clearAuthError();
}

function showAuthError(message) {
  const el = document.getElementById('authError');
  el.textContent = message;
  el.classList.remove('hidden');
}

function clearAuthError() {
  const el = document.getElementById('authError');
  el.textContent = '';
  el.classList.add('hidden');
}

/** Подставляет сгенерированный сервером пароль в поле регистрации. */
async function fillGeneratedPassword() {
  try {
    const { password } = await api('/api/auth/generate-password');
    document.getElementById('registerPassword').value = password;
  } catch (error) {
    showAuthError(error.message);
  }
}

/** Обработчик формы входа — по паролю или по кодовому слову. */
async function submitLogin(event) {
  event.preventDefault();
  clearAuthError();

  const login = document.getElementById('loginLogin').value.trim();
  const byCodeword = !document.getElementById('loginCodewordGroup').classList.contains('hidden');

  const button = document.getElementById('loginSubmit');
  button.disabled = true;

  try {
    const data = byCodeword
      ? await api('/api/auth/login-codeword', {
          method: 'POST',
          body: { login, codeword: document.getElementById('loginCodeword').value },
        })
      : await api('/api/auth/login', {
          method: 'POST',
          body: { login, password: document.getElementById('loginPassword').value },
        });

    await onAuthSuccess(data.user);
  } catch (error) {
    showAuthError(error.message);
  } finally {
    button.disabled = false;
  }
}

/** Обработчик формы регистрации. */
async function submitRegister(event) {
  event.preventDefault();
  clearAuthError();

  const button = document.getElementById('registerSubmit');
  button.disabled = true;

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: {
        login: document.getElementById('registerLogin').value.trim(),
        password: document.getElementById('registerPassword').value,
        codeword: document.getElementById('registerCodeword').value,
      },
    });

    await onAuthSuccess(data.user);
  } catch (error) {
    showAuthError(error.message);
  } finally {
    button.disabled = false;
  }
}

/**
 * Общий хвост входа и регистрации: закрыть модалку, обновить шапку
 * и — главное — продолжить прерванный анализ, если он был.
 */
async function onAuthSuccess(user) {
  state.user = user;
  renderTopbar();
  closeAuthModal();
  clearAuthForms();

  if (state.pendingChannel) {
    const channel = state.pendingChannel;
    state.pendingChannel = null;
    await runAnalysis(channel);
  } else {
    await goToDashboard();
  }
}

/** Чистит поля форм, чтобы пароль не оставался в DOM. */
function clearAuthForms() {
  ['loginLogin', 'loginPassword', 'loginCodeword',
   'registerLogin', 'registerPassword', 'registerCodeword']
    .forEach(id => { document.getElementById(id).value = ''; });

  switchToPassword();
}

/** Выход из аккаунта. */
async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // даже если запрос не прошёл, состояние вкладки сбрасываем
  }

  state.user = null;
  state.channel = null;
  renderTopbar();
  showScreen('landing');
}

/** Перерисовывает шапку под текущего пользователя. */
function renderTopbar() {
  const topbar = document.getElementById('topbar');

  if (state.user) {
    topbar.innerHTML = `
      <span class="topbar-user">${escapeHtml(state.user.login)}</span>
      <button class="btn-ghost" onclick="goToDashboard()">Мои каналы</button>
      <button class="btn-ghost" onclick="logout()">Выйти</button>
    `;
  } else {
    topbar.innerHTML = `<button class="btn-ghost" onclick="openAuthModal()">Войти</button>`;
  }
}
