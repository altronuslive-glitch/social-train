/**
 * VK Parser — забирает посты со страницы/группы через VK API.
 *
 * Для работы нужен VK Service Token (сервисный токен приложения):
 * 1. Зайди на vk.com/dev → «Создать приложение» → тип «Standalone»
 * 2. В настройках приложения скопируй «Сервисный ключ доступа»
 * 3. Добавь в Railway: VK_SERVICE_TOKEN=<ключ>
 */

/**
 * Получает последние посты со страницы VK.
 * @param {object} params
 * @param {string} params.domain    — короткое имя группы/страницы (например "durov" или "vk")
 * @param {number} [params.count]   — сколько постов взять (по умолчанию 50)
 * @param {string} [params.token]   — VK Service Token (если не передан — берём из env)
 * @returns {Promise<VkPost[]>}
 */
export async function parseVkPage({ domain, count = 50, token }) {
  const accessToken = token || process.env.VK_SERVICE_TOKEN;

  if (!accessToken) {
    throw new Error(
      'VK_SERVICE_TOKEN не задан. Добавь его в переменные окружения Railway.'
    );
  }

  const url = new URL('https://api.vk.com/method/wall.get');
  url.searchParams.set('domain', domain);
  url.searchParams.set('count', String(count));
  url.searchParams.set('filter', 'owner');   // только посты самой страницы, без репостов
  url.searchParams.set('v', '5.199');
  url.searchParams.set('access_token', accessToken);

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`VK API HTTP ${resp.status}: ${resp.statusText}`);
  }

  const data = await resp.json();

  if (data.error) {
    throw new Error(`VK API error ${data.error.error_code}: ${data.error.error_msg}`);
  }

  const items = data.response?.items || [];

  return items
    .filter(post => post.text && post.text.trim().length > 20) // только посты с текстом
    .map(post => ({
      id: post.id,
      date: new Date(post.date * 1000).toISOString(),
      text: post.text,
      likes: post.likes?.count || 0,
      reposts: post.reposts?.count || 0,
      views: post.views?.count || 0,
      comments: post.comments?.count || 0,
      hasPhoto: post.attachments?.some(a => a.type === 'photo') || false,
      hasVideo: post.attachments?.some(a => a.type === 'video') || false,
    }));
}
