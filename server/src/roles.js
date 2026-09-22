import { config } from './config.js';
import { db } from './db.js';

// Wer als "Owner" markiert wird. Festgelegt ueber Discord-IDs in OWNER_DISCORD_IDS (server/.env),
// nicht ueber Namen: einen Namen koennte sich jeder Gast geben, eine Discord-ID nicht.

const owners = new Set();

/** Liest die Nutzer-IDs der Owner neu ein (nach jedem Discord-Login aufrufen). */
export function refreshOwners() {
  owners.clear();
  const ids = config.ownerDiscordIds;
  if (!ids.length) return;
  const rows = db.prepare(`SELECT id FROM users WHERE discord_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  for (const row of rows) owners.add(row.id);
}

refreshOwners();

export const isOwner = (userId) => owners.has(userId);
