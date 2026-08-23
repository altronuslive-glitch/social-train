/**
 * Экран канала: слева редактируемая карточка бренда, справа темы и посты.
 */

/**
 * Поля карточки бренда, доступные для правки.
 *
 * type: 'text' — обычное поле, 'list' — массив, по одному пункту на строку.
 * secondary: true — поле уезжает в свёрнутый блок «Остальные поля».
 *
 * Наверху оставлены пять полей, которые сильнее всего меняют результат
 * генерации: раньше карточка разворачивалась на два экрана и найти в ней
 * нужное было тяжело. Остальное никуда не делось — просто убрано под
 * раскрывающийся блок и правится там же.
 */
const BRAND_FIELDS = [
  {
    path: 'brand.niche',
    label: 'Ниша',
    hint: 'Сфера канала в двух словах. Задаёт словарь и уместные примеры.',
    rows: 1,
  },
  {
    path: 'brand.description',
    label: 'О чём канал',
    hint: 'Что здесь публикуют и зачем читателю подписываться.',
    rows: 3,
  },
  {
    path: 'toneOfVoice.summary',
    label: 'Голос бренда',
    hint: 'Как канал разговаривает: интонация, дистанция, степень формальности.',
    rows: 4,
  },
  {
    path: 'audience.portrait',
    label: 'Аудитория',
    hint: 'Кто читает: возраст, занятия, что для этих людей важно.',
    rows: 3,
  },
  {
    path: 'contentGuidelines.dontList',
    label: 'Чего избегать',
    hint: 'По пункту на строку. Самый быстрый способ убрать то, что не нравится в постах.',
    rows: 4,
    type: 'list',
  },

  // Ниже — подробности из анализа. Влияют на генерацию так же, но менять
  // их приходится редко, поэтому по умолчанию свёрнуты.
  { path: 'brand.name',                    label: 'Название',                rows: 1, secondary: true },
  { path: 'brand.uniqueness',              label: 'Уникальность',            rows: 3, secondary: true },
  { path: 'brand.positioning',             label: 'Позиционирование',        rows: 2, secondary: true },

  { path: 'toneOfVoice.characteristics',   label: 'Характеристики голоса',   rows: 3, type: 'list', secondary: true },
  { path: 'toneOfVoice.language',          label: 'Язык',                    rows: 2, secondary: true },
  { path: 'toneOfVoice.emotionality',      label: 'Эмоциональность',         rows: 2, secondary: true },
  { path: 'toneOfVoice.humor',             label: 'Юмор',                    rows: 2, secondary: true },
  { path: 'toneOfVoice.appeals',           label: 'Обращение к аудитории',   rows: 2, secondary: true },
  { path: 'toneOfVoice.forbiddenTone',     label: 'Чего избегать в тоне',    rows: 2, secondary: true },

  { path: 'audience.painPoints',           label: 'Боли аудитории',          rows: 3, type: 'list', secondary: true },
  { path: 'audience.desires',              label: 'Желания аудитории',       rows: 3, type: 'list', secondary: true },
  { path: 'audience.expertiseLevel',       label: 'Уровень экспертизы',      rows: 1, secondary: true },

  { path: 'visualIdentity.summary',        label: 'Визуальный стиль',        rows: 3, secondary: true },
  { path: 'visualIdentity.mood',           label: 'Настроение визуала',      rows: 2, secondary: true },

  { path: 'contentGuidelines.doList',      label: 'Что делать',              rows: 4, type: 'list', secondary: true },
  { path: 'contentGuidelines.textRules',   label: 'Правила оформления',      rows: 4, type: 'list', secondary: true },
];

/** Достаёт значение по пути вида 'brand.niche'. */
function getByPath(object, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), object);
}

/** Записывает значение по пути, создавая недостающие объекты. */
function setByPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();

  let target = object;
  for (const key of keys) {
    if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
    target = target[key];
  }

  target[last] = value;
}

/**
 * Открывает канал: грузит его с сервера и рисует экран.
 * @param {number} channelId
 */
async function openChannel(channelId) {
  try {
    const { channel } = await api(`/api/channels/${channelId}`);

    state.channel = channel;
    renderChannelView();
    showScreen('channelView');
  } catch (error) {
    showError(error.message);
  }
}

/** Рисует весь экран канала по state.channel. */
function renderChannelView() {
  const channel = state.channel;

  document.getElementById('channelViewTitle').textContent = `@${channel.handle}`;

  renderBrandCardEditor(channel.brandCard);
  renderTopics(channel.groups, channel.topics);
  renderPosts(channel.posts);
}

/** Строит форму правки карточки бренда. */
function renderBrandCardEditor(brandCard) {
  const container = document.getElementById('brandCardEditor');

  if (!brandCard) {
    container.innerHTML = '<div class="empty-state">Карточка бренда отсутствует.</div>';
    return;
  }

  // Индекс в общем массиве — это же id поля, поэтому считаем его до фильтрации:
  // сохранение ищет textarea по нему и не должно зависеть от разбиения
  const fields = BRAND_FIELDS.map((field, index) => ({ field, index }));
  const primary = fields.filter(({ field }) => !field.secondary);
  const secondary = fields.filter(({ field }) => field.secondary);

  const renderGroup = (group) => group
    .map(({ field, index }) => brandFieldMarkup(brandCard, field, index))
    .join('');

  container.innerHTML = renderGroup(primary) + (secondary.length === 0 ? '' : `
    <details class="brand-extra">
      <summary>Остальные поля карточки (${secondary.length})</summary>
      <div class="brand-extra-body">${renderGroup(secondary)}</div>
    </details>
  `);
}

/** Разметка одного поля карточки. */
function brandFieldMarkup(brandCard, field, index) {
  const raw = getByPath(brandCard, field.path);

  const value = field.type === 'list'
    ? (Array.isArray(raw) ? raw.join('\n') : (raw ?? ''))
    : (raw ?? '');

  return `
    <div class="brand-field">
      <label for="brandField${index}">${escapeHtml(field.label)}</label>
      ${field.hint ? `<p class="brand-hint">${escapeHtml(field.hint)}</p>` : ''}
      <textarea id="brandField${index}" rows="${field.rows}"
                data-path="${field.path}" data-type="${field.type || 'text'}">${escapeHtml(value)}</textarea>
    </div>
  `;
}

/** Собирает карточку из формы и сохраняет её. */
async function saveBrandCard() {
  const status = document.getElementById('brandSaveStatus');
  const button = document.getElementById('saveBrandBtn');

  // Правим копию, чтобы при ошибке сохранения не разъехалось состояние
  const brandCard = JSON.parse(JSON.stringify(state.channel.brandCard || {}));

  BRAND_FIELDS.forEach((field, index) => {
    const textarea = document.getElementById(`brandField${index}`);
    if (!textarea) return;

    const value = field.type === 'list'
      ? textarea.value.split('\n').map(line => line.trim()).filter(Boolean)
      : textarea.value;

    setByPath(brandCard, field.path, value);
  });

  button.disabled = true;
  status.textContent = 'Сохраняю...';
  status.className = 'save-status';

  try {
    await api(`/api/channels/${state.channel.id}/brand-card`, {
      method: 'PATCH',
      body: { brandCard },
    });

    state.channel.brandCard = brandCard;

    status.textContent = 'Изменения сохранены';
    status.className = 'save-status ok';
    setTimeout(() => { status.textContent = ''; }, 2500);
  } catch (error) {
    status.textContent = error.message;
    status.className = 'save-status err';
  } finally {
    button.disabled = false;
  }
}

/** Рисует темы — сгруппированные, если группы есть, иначе плоским списком. */
function renderTopics(groups, topics) {
  const container = document.getElementById('topicsContainer');

  if (!topics || topics.length === 0) {
    container.innerHTML = '<div class="empty-state">Идей пока нет. Нажмите кнопку выше, чтобы сгенерировать их.</div>';
    hideElement('generatePostsWrap');
    return;
  }

  if (groups && groups.length > 0) {
    container.innerHTML = groups.map((group, groupIndex) => `
      <div class="topic-group">
        <div class="topic-group-header" onclick="toggleGroup(${groupIndex})">
          <div class="topic-group-title">
            <span class="topic-group-icon">${escapeHtml(group.groupIcon || '📝')}</span>
            <span>${escapeHtml(group.groupName || 'Темы')}</span>
          </div>
          <span class="topic-group-badge">${group.topicCount ?? group.topics?.length ?? 0}</span>
        </div>
        <div class="topic-group-content" id="group${groupIndex}">
          <div class="topics-grid">
            ${(group.topics || []).map(topic => topicCard(topic)).join('')}
          </div>
        </div>
      </div>
    `).join('');
  } else {
    container.innerHTML = `<div class="topics-grid">${topics.map(topic => topicCard(topic)).join('')}</div>`;
  }

  showElement('generatePostsWrap');
}

/** Карточка одной темы с галочкой. */
function topicCard(topic) {
  return `
    <div class="topic-card" onclick="toggleTopic(${topic.id}, event)" id="topicCard${topic.id}">
      <div class="topic-title">
        <input type="checkbox" id="topic${topic.id}" onclick="event.stopPropagation()"
               onchange="syncTopicCard(${topic.id})">
        ${escapeHtml(topic.title || '')}
      </div>
      ${topic.description ? `<div class="topic-desc">${escapeHtml(topic.description)}</div>` : ''}
      ${topic.contentType ? `<div class="topic-meta">${escapeHtml(topic.contentType)}</div>` : ''}
    </div>
  `;
}

/** Сворачивает и разворачивает группу тем. */
function toggleGroup(groupIndex) {
  document.getElementById(`group${groupIndex}`)?.classList.toggle('collapsed');
}

/** Клик по карточке темы переключает галочку. */
function toggleTopic(topicId, event) {
  if (event?.target?.tagName === 'INPUT') return;

  const checkbox = document.getElementById(`topic${topicId}`);
  checkbox.checked = !checkbox.checked;
  syncTopicCard(topicId);
}

/** Подсвечивает выбранную тему. */
function syncTopicCard(topicId) {
  const checkbox = document.getElementById(`topic${topicId}`);
  document.getElementById(`topicCard${topicId}`)?.classList.toggle('selected', checkbox.checked);
}

/** Перегенерирует темы по текущей карточке бренда. */
async function regenerateTopics() {
  const button = document.getElementById('genTopicsBtn');

  button.disabled = true;
  button.textContent = '⏳ Генерирую идеи...';

  try {
    const data = await api(`/api/channels/${state.channel.id}/topics`, { method: 'POST' });

    state.channel.topics = data.topics;
    state.channel.groups = data.groups;

    renderTopics(data.groups, data.topics);
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Сгенерировать идеи заново';
  }
}

/** Генерирует посты по отмеченным темам. */
async function generatePostsForChannel() {
  const selectedIds = (state.channel.topics || [])
    .filter(topic => document.getElementById(`topic${topic.id}`)?.checked)
    .map(topic => topic.id);

  if (selectedIds.length === 0) {
    alert('Выберите хотя бы одну тему');
    return;
  }

  showScreen('loading');
  setProgress(5, `🤖 Генерирую ${selectedIds.length} постов...`);

  try {
    // Потоком: каждый готовый пост сразу двигает прогресс
    const data = await streamRequest(
      `/api/channels/${state.channel.id}/posts/stream?topicIds=${selectedIds.join(',')}`,
      ({ message, progress }) => setProgress(progress ?? 0, message),
    );

    setProgress(100, '✅ Посты готовы!');
    await sleep(400);

    state.channel.posts = data.posts;

    renderChannelView();
    showScreen('channelView');
  } catch (error) {
    showError(error.message);
  }
}
