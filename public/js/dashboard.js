/**
 * Личный кабинет: список сохранённых каналов карточками.
 */

/** Загружает каналы и показывает кабинет. */
async function goToDashboard() {
  try {
    const { channels } = await api('/api/channels');

    renderChannels(channels);
    showScreen('dashboard');
  } catch (error) {
    showError(error.message);
  }
}

/** Рисует карточки каналов. */
function renderChannels(channels) {
  const container = document.getElementById('channelsGrid');

  if (!channels || channels.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        Пока ни одного канала.<br>
        Проанализируйте первый — он сохранится сюда.
      </div>
    `;
    return;
  }

  container.innerHTML = channels.map(channel => `
    <div class="channel-card" onclick="openChannel(${channel.id})">
      <button class="channel-card-delete" title="Удалить канал"
              onclick="removeChannel(event, ${channel.id})">✕</button>
      <div class="channel-card-handle">@${escapeHtml(channel.handle)}</div>
      <div class="channel-card-title">${escapeHtml(channel.title || '')}</div>
      <div class="channel-card-meta">
        <span>📝 ${channel.posts_count} постов</span>
        <span>🖼 ${channel.images_count} картинок</span>
      </div>
    </div>
  `).join('');
}

/** Удаляет канал вместе с постами и картинками. */
async function removeChannel(event, channelId) {
  event.stopPropagation();

  // Имя берём из разметки, а не из аргумента — так в onclick не попадают кавычки
  const handle = document.querySelector(`#channelsGrid [onclick*="openChannel(${channelId})"] .channel-card-handle`)?.textContent || '';

  if (!confirm(`Удалить канал ${handle} вместе со всеми постами и картинками?`)) return;

  try {
    await api(`/api/channels/${channelId}`, { method: 'DELETE' });
    await goToDashboard();
  } catch (error) {
    showError(error.message);
  }
}
