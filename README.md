# Social Train 🚀

AI-powered контент генератор для Telegram каналов с мульти-агентной архитектурой.

## 🎯 Возможности

### v2.0 - Новый workflow с карточкой бренда

1. **Интеллектуальный анализ канала**
   - Парсинг 30 постов из публичного Telegram-канала
   - Параллельный анализ текста и изображений через DeepSeek
   - Формирование детальной карточки бренда

2. **Карточка бренда**
   - Tone of Voice с конкретными примерами из постов
   - Визуальный стиль и паттерны
   - Типы контента с рекомендациями
   - Портрет аудитории и её боли/желания
   - Уникальность и позиционирование

3. **Генерация тем**
   - 20 релевантных тем для будущих постов
   - Основаны на анализе существующего контента
   - Учитывают боли и желания аудитории

4. **Выбор и генерация**
   - Пользователь выбирает интересующие темы
   - Генерация постов по выбранным темам
   - Мульти-агентная проверка качества (SMM Agent → Image Agent → Art Director)

5. **Генерация изображений**
   - Интеграция с Grok API (xAI)
   - Автоматическая генерация визуала по промптам
   - Поддержка различных форматов и стилей

## 🏗️ Архитектура

### Агенты-анализаторы
- **Text Analyzer** - анализирует текстовое содержимое, извлекает tone of voice
- **Image Analyzer** - анализирует визуальный стиль через DeepSeek Vision
- **Brand Card Builder** - объединяет результаты в единую карточку бренда

### Агенты генерации контента
- **SMM Agent** - пишет тексты постов в точном соответствии с tone of voice
- **Image Agent** - создаёт детальные промпты для нейросетей
- **Art Director** - проверяет качество и соответствие бренду

### Сервисы
- **Topic Generator** - генерирует релевантные темы на основе карточки бренда
- **Pipeline** - оркестрирует работу всех агентов
- **Telegram Parser** - парсит публичные каналы без API токена
- **Grok Integration** - генерирует изображения через xAI API

## 🚀 Deployment

Проект развернут на Railway: https://social-train-production.up.railway.app

### Переменные окружения

```bash
# DeepSeek API (обязательно)
DS_API_KEY=sk-...
# или
DEEPSEEK_API_KEY=sk-...

# Claude API (опционально, для анализа изображений)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI API (опционально)
OPENAI_API_KEY=sk-...

# Grok API (передается через UI)
# Не нужно добавлять в переменные окружения
```

## 📖 API Endpoints

### 1. Анализ канала
```bash
POST /api/analyze/channel
Content-Type: application/json

{
  "channel": "cvetidnya",
  "postsCount": 30
}
```

**Ответ:**
```json
{
  "success": true,
  "channel": "cvetidnya",
  "analyzedPostsCount": 30,
  "brandCard": {
    "brand": { "niche": "...", "description": "..." },
    "toneOfVoice": { ... },
    "visualIdentity": { ... },
    "contentTypes": [ ... ],
    "audience": { ... }
  },
  "topics": [
    {
      "id": 1,
      "title": "...",
      "description": "...",
      "contentType": "...",
      "goal": "..."
    }
  ]
}
```

### 2. Генерация постов
```bash
POST /api/analyze/generate-posts
Content-Type: application/json

{
  "brandCard": { ... },
  "selectedTopicIds": [1, 3, 5, 7, 10],
  "topics": [ ... ]
}
```

**Ответ:**
```json
{
  "success": true,
  "postsCount": 5,
  "approvedCount": 4,
  "posts": [
    {
      "topicId": 1,
      "topicTitle": "...",
      "postText": "...",
      "imagePrompt": "...",
      "artDirectorVerdict": "APPROVED",
      "textScore": 85,
      "imageScore": 90
    }
  ]
}
```

### 3. Генерация изображений
```bash
POST /api/generate/images
Content-Type: application/json

{
  "posts": [ ... ],
  "grokApiKey": "xai-..."
}
```

**Ответ:**
```json
{
  "success": true,
  "total": 5,
  "successCount": 5,
  "results": [
    {
      "postIndex": 0,
      "topicId": 1,
      "imageUrl": "https://...",
      "status": "success"
    }
  ]
}
```

### 4. Тест API ключей
```bash
GET /api/test-api
```

Проверяет работоспособность всех подключенных API (DeepSeek, Claude, GPT).

## 💻 Локальная разработка

```bash
# Установка зависимостей
npm install

# Создать .env файл
echo "DS_API_KEY=your-deepseek-key" > .env

# Запуск
npm start

# Приложение доступно на http://localhost:3000
```

## 🌐 Веб-интерфейс

Откройте https://social-train-production.up.railway.app в браузере.

### Workflow:

1. **Введите ссылку на Telegram-канал** (например: `cvetidnya` или `https://t.me/cvetidnya`)
2. **Нажмите "Анализировать канал"** - система спарсит 30 постов и создаст карточку бренда
3. **Просмотрите карточку бренда** - детальный анализ tone of voice и визуального стиля
4. **Выберите темы** - отметьте чекбоксами интересующие темы (до 20)
5. **Сгенерируйте посты** - система создаст тексты и промпты для изображений
6. **Добавьте Grok API ключ** и нажмите "Сгенерировать изображения"
7. **Готово!** - скачайте результат или скопируйте тексты

## 🔧 Технологии

- **Backend**: Node.js + Express
- **AI Models**: 
  - DeepSeek (текст + vision)
  - Claude Sonnet 4 (опционально, для визуального анализа)
  - Grok (генерация изображений)
- **Парсинг**: Cheerio (web scraping)
- **Frontend**: Vanilla JS (без фреймворков)
- **Deployment**: Railway

## 📝 Примечания

- Telegram парсинг работает только с **публичными каналами**
- DeepSeek Vision может быть недоступен - в этом случае используется fallback на текстовый анализ
- Для генерации изображений нужен **Grok API ключ** от xAI
- Система анализирует топ-30 постов по просмотрам
- Качество постов проверяется арт-директором (минимум 70/100 баллов)

## 🚧 Roadmap

- [ ] Поддержка VK парсинга
- [ ] Сохранение карточек брендов в базу данных
- [ ] Экспорт результатов в различных форматах
- [ ] Поддержка других моделей для генерации изображений (DALL-E, Midjourney)
- [ ] Планирование публикаций
- [ ] Интеграция с Telegram Bot API для автопостинга

## 📄 Лицензия

MIT

## 👨‍💻 Разработчик

altronuslive-glitch

---

**Social Train** - умный помощник для создания контента, который понимает ваш бренд.
