import { Router } from 'express';
import { config, discordEnabled } from './config.js';
import { userFromCookieHeader } from './auth.js';
import { getPackMeta, rankedSections } from './packs.js';
import { leaderboard, recentMatches, userStats } from './game/persist.js';
import { getUser, publicUser } from './users.js';

export function createApiRouter(hub) {
  const api = Router();

  api.get('/api/config', (_req, res) => {
    res.json({
      version: config.version,
      discordEnabled: discordEnabled(),
      allowGuests: config.allowGuests,
      rankedSections: rankedSections(),
    });
  });

  api.get('/api/me', (req, res) => {
    const row = userFromCookieHeader(req.headers.cookie);
    if (!row) return res.json({ user: null });
    res.json({ user: publicUser(row), stats: userStats(row.id) });
  });

  api.get('/api/packs', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ packs: getPackMeta() });
  });

  api.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: leaderboard(100) });
  });

  api.get('/api/users/:id', (req, res) => {
    const row = getUser(req.params.id);
    if (!row) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    res.json({ user: publicUser(row), stats: userStats(row.id), matches: recentMatches(row.id) });
  });

  api.get('/api/status', (_req, res) => {
    res.json({ ok: true, ...hub.stats() });
  });

  return api;
}
