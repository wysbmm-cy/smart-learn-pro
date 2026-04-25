import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = process.env.AUTH_DB_DIR || path.join(process.cwd(), 'server', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.AUTH_DB_PATH || path.join(dataDir, 'auth.sqlite');
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
`);

export const statements = {
  findUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare(`
    INSERT INTO users (id, email, password_hash, nickname, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  insertSession: db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `),
  findSession: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
};

export const toPublicUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname || '',
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
};
