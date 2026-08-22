/**
 * SQLite-хранилище на встроенном в Node модуле node:sqlite.
 * Внешних зависимостей не требует.
 *
 * Файл базы и картинки лежат в каталоге DATA_DIR. На Railway туда
 * подключён постоянный диск (/data) — без него данные стирались бы
 * при каждом деплое, потому что файловая система контейнера временная.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/** Каталог для базы и загруженных файлов. */
export const DATA_DIR = process.env.DATA_DIR || './data';

/** Каталог с сохранёнными картинками постов. */
export const MEDIA_DIR = path.join(DATA_DIR, 'media');

let db = null;

/**
 * Открывает базу и создаёт схему. Вызывается один раз при старте сервера.
 * @returns {DatabaseSync}
 */
export function initDb() {
  if (db) return db;

  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(MEDIA_DIR, { recursive: true });

  const dbPath = path.join(DATA_DIR, 'social-train.db');
  db = new DatabaseSync(dbPath);

  // WAL ускоряет параллельные чтения, foreign_keys включает каскадное удаление
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      login         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      codeword_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channels (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      handle               TEXT NOT NULL,
      title                TEXT,
      brand_card           TEXT,
      topics               TEXT,
      groups               TEXT,
      analyzed_posts_count INTEGER DEFAULT 0,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id      INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      topic_id        INTEGER,
      topic_title     TEXT,
      post_text       TEXT NOT NULL DEFAULT '',
      image_prompt    TEXT,
      negative_prompt TEXT,
      aspect_ratio    TEXT DEFAULT '1:1',
      image_path      TEXT,
      position        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_channels_user ON channels(user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel_id, position);
  `);

  console.log(`🗄️  База данных готова: ${dbPath}`);

  return db;
}

/**
 * Возвращает открытое соединение.
 * @returns {DatabaseSync}
 */
export function getDb() {
  if (!db) return initDb();
  return db;
}
