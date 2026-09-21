import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'opal.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

// Jede Migration laeuft genau einmal, gesteuert ueber PRAGMA user_version.
// Neue Schemaaenderungen nur hinten anhaengen, nie bestehende Eintraege aendern.
const migrations = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    discord_id TEXT UNIQUE,
    name TEXT NOT NULL,
    avatar TEXT,
    is_guest INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL DEFAULT 1000,
    peak_rating INTEGER NOT NULL DEFAULT 1000,
    ranked_games INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    variant TEXT,
    answer_mode TEXT NOT NULL,
    sections TEXT NOT NULL,
    question_count INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    winner_id TEXT,
    end_reason TEXT NOT NULL
  );
  CREATE TABLE match_players (
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_bot INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    wrong INTEGER NOT NULL,
    avg_ms INTEGER,
    best_streak INTEGER NOT NULL DEFAULT 0,
    placement INTEGER NOT NULL,
    rating_before INTEGER,
    rating_after INTEGER,
    PRIMARY KEY (match_id, user_id)
  );
  CREATE INDEX idx_match_players_user ON match_players(user_id);
  CREATE INDEX idx_users_rating ON users(rating DESC);
  CREATE INDEX idx_sessions_user ON sessions(user_id);
  `,
];

const current = db.prepare('PRAGMA user_version').get().user_version;
for (let v = current; v < migrations.length; v++) {
  db.exec('BEGIN');
  try {
    db.exec(migrations[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
