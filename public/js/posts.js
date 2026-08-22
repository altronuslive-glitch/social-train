/**
 * Список постов: правка текста прямо в окне вывода и генерация картинок.
 */

/**
 * Рисует все посты канала.
 * @param {object[]} posts — посты из базы (у каждого есть id)
 */
function renderPosts(posts) {
  const container = document.getElementById('postsList');

  if (!posts || posts.length === 0) {
    container.innerHTML = '<div class="empty-state">Постов пока нет. Выберите темы выше и сгенерируйте их.</div>';
    hideElement('postsCard');
    return;
  }

  container.innerHTML = posts.map((post, index) => `
    <div class="post-item" id="post${post.id}">
      <div class="post-header">
        <div class="post-title">${index + 1}. ${escapeHtml(post.topicTitle || 'Без темы')}</div>
        <div class="post-actions">
          <button class="btn-icon" onclick="copyPostText(${post.id})" id="copyBtn${post.id}">📋 Копировать</button>
          <button class="btn-icon" onclick="startEditPost(${post.id})" id="editBtn${post.id}">✏️ Редактировать</button>
        </div>
      </div>

      <div class="post-text" id="postText${post.id}">${escapeHtml(post.postText)}</div>
      <textarea class="post-editor hidden" id="postEditor${post.id}"></textarea>

      <div class="hidden" id="editActions${post.id}" style="margin-bottom:15px">
        <button class="btn" onclick="savePostText(${post.id})">Сохранить</button>
        <button class="btn-icon" style="display:inline-flex;margin-left:8px" onclick="cancelEditPost(${post.id})">Отмена</button>
      </div>

      <div class="save-status" id="postStatus${post.id}"></div>

      ${post.imagePrompt ? `
        <details>
          <summary style="cursor: pointer; margin-bottom: 10px;">Промпт для изображения</summary>
          <div class="post-prompt">${escapeHtml(post.imagePrompt)}</div>
        </details>
      ` : ''}

      <button class="btn-generate-image" onclick="generatePostImage(${post.id})" id="generateBtn${post.id}">
        ${post.imageUrl ? '🔄 Перегенерировать изображение' : '🎨 Сгенерировать изображение'}
      </button>

      <div class="post-image" id="postImage${post.id}">
        ${post.imageUrl ? renderImage(post.imageUrl, post.id) : ''}
      </div>
    </div>
  `).join('');

  showElement('postsCard');
}

/** Разметка готовой картинки с кнопкой скачивания. */
function renderImage(url, postId) {
  return `
    <img src="${escapeHtml(url)}" alt="Изображение поста" id="img${postId}">
    <br>
    <button class="btn-download" onclick="downloadImage('${escapeHtml(url)}', ${postId})">
      ⬇️ Скачать изображение
    </button>
  `;
}

/** Копирует текст поста в буфер обмена. */
async function copyPostText(postId) {
  const text = document.getElementById(`postText${postId}`).textContent;
  const button = document.getElementById(`copyBtn${postId}`);

  try {
    await navigator.clipboard.writeText(text);

    button.textContent = '✅ Скопировано';
    button.classList.add('copied');

    setTimeout(() => {
      button.textContent = '📋 Копировать';
      button.classList.remove('copied');
    }, 2000);
  } catch {
    alert('Не удалось скопировать текст');
  }
}

/** Переводит пост в режим правки. */
function startEditPost(postId) {
  const view = document.getElementById(`postText${postId}`);
  const editor = document.getElementById(`postEditor${postId}`);
  const actions = document.getElementById(`editActions${postId}`);

  editor.value = view.textContent;

  view.classList.add('hidden');
  editor.classList.remove('hidden');
  actions.classList.remove('hidden');
  document.getElementById(`editBtn${postId}`).style.display = 'none';

  editor.focus();
}

/** Выходит из режима правки без сохранения. */
function cancelEditPost(postId) {
  document.getElementById(`postText${postId}`).classList.remove('hidden');
  document.getElementById(`postEditor${postId}`).classList.add('hidden');
  document.getElementById(`editActions${postId}`).classList.add('hidden');
  document.getElementById(`editBtn${postId}`).style.display = 'inline-flex';
  setPostStatus(postId, '', '');
}

/** Сохраняет отредактированный текст на сервере. */
async function savePostText(postId) {
  const editor = document.getElementById(`postEditor${postId}`);
  const newText = editor.value;

  try {
    await api(`/api/posts/${postId}`, { method: 'PATCH', body: { postText: newText } });

    document.getElementById(`postText${postId}`).textContent = newText;

    // Обновляем и локальную копию, чтобы перерисовка не вернула старый текст
    const post = state.channel?.posts?.find(p => p.id === postId);
    if (post) post.postText = newText;

    cancelEditPost(postId);
    setPostStatus(postId, 'Сохранено', 'ok');
    setTimeout(() => setPostStatus(postId, '', ''), 2000);
  } catch (error) {
    setPostStatus(postId, error.message, 'err');
  }
}

function setPostStatus(postId, message, kind) {
  const el = document.getElementById(`postStatus${postId}`);
  if (!el) return;
  el.textContent = message;
  el.className = `save-status ${kind}`;
}

/** Генерирует картинку для поста и сохраняет её у нас. */
async function generatePostImage(postId) {
  const button = document.getElementById(`generateBtn${postId}`);
  const container = document.getElementById(`postImage${postId}`);

  container.innerHTML = `
    <div class="image-placeholder">
      <div class="image-loading"></div>
      <p style="color: #666;">Генерация изображения...</p>
    </div>
  `;

  button.disabled = true;
  button.textContent = '⏳ Генерация...';

  try {
    const data = await api(`/api/posts/${postId}/image`, { method: 'POST' });

    container.innerHTML = renderImage(data.imageUrl, postId);

    const post = state.channel?.posts?.find(p => p.id === postId);
    if (post) post.imageUrl = data.imageUrl;

    button.textContent = '✅ Изображение готово';
    setTimeout(() => {
      button.textContent = '🔄 Перегенерировать изображение';
      button.disabled = false;
    }, 2000);
  } catch (error) {
    container.innerHTML = `<p style="color: #e53e3e;">❌ Ошибка: ${escapeHtml(error.message)}</p>`;
    button.textContent = '🎨 Попробовать снова';
    button.disabled = false;
  }
}

/** Скачивает картинку файлом. */
async function downloadImage(url, postId) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `post-${postId}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch {
    alert('Не удалось скачать изображение');
  }
}
