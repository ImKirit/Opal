import { Router } from 'express';
import { config, discordEnabled } from './config.js';
import { requireUser, userFromCookieHeader } from './auth.js';
import { acceptFriend, friendCard, listFriends, relation, removeFriendship, requestFriend, searchUsers } from './friends.js';
import { bundleMeta } from './bundles.js';
import { getPackMeta, rankedSections } from './packs.js';
import { ladderMeta } from './game/ladders.js';
import { boardList, isBoard, leaderboard, recentMatches, userStats } from './game/persist.js';
import { getUser, publicUser } from './users.js';

export function createApiRouter(hub) {
  const api = Router();

  api.get('/api/config', (_req, res) => {
    res.json({
      version: config.version,
      discordEnabled: discordEnabled(),
      allowGuests: config.allowGuests,
      rankedSections: rankedSections(),
      ladders: ladderMeta(),
      boards: boardList(),
    });
  });

  api.get('/api/me', (req, res) => {
    const row = userFromCookieHeader(req.headers.cookie);
    if (!row) return res.json({ user: null });
    res.json({ user: publicUser(row), stats: userStats(row.id) });
  });

  api.get('/api/packs', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ packs: getPackMeta(), bundles: bundleMeta() });
  });

  // ?board=standard | tippen | siege | spielzeit | tempo | ueberleben (siehe boardList)
  api.get('/api/leaderboard', (req, res) => {
    const board = isBoard(req.query.board) ? req.query.board : boardList()[0].id;
    const me = userFromCookieHeader(req.headers.cookie);
    res.json({ board, ...leaderboard(board, { limit: 100, userId: me?.id ?? null }) });
  });

  api.get('/api/users/:id', (req, res) => {
    const row = getUser(req.params.id);
    if (!row) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    res.json({ user: publicUser(row), stats: userStats(row.id), matches: recentMatches(row.id) });
  });

  // ----- Freunde -----
  const withPresence = (row) => ({ ...friendCard(row), presence: hub.presence(row.id) });

  api.get('/api/friends', requireUser, (req, res) => {
    const { friends, incoming, outgoing } = listFriends(req.user.id);
    res.json({
      friends: friends.map(withPresence),
      incoming: incoming.map(friendCard),
      outgoing: outgoing.map(friendCard),
    });
  });

  api.get('/api/friends/search', requireUser, (req, res) => {
    const users = searchUsers(req.user.id, req.query.q).map((row) => ({
      ...friendCard(row),
      relation: relation(req.user.id, row.id),
    }));
    res.json({ users });
  });

  api.post('/api/friends/request', requireUser, (req, res) => {
    const result = requestFriend(req.user.id, String(req.body?.userId ?? ''));
    if (!result.ok) return res.status(400).json({ error: result.error });
    hub.notify(req.body.userId, 'friends:changed', { reason: result.status === 'accepted' ? 'accepted' : 'request', from: req.user.name });
    res.json(result);
  });

  api.post('/api/friends/accept', requireUser, (req, res) => {
    const fromId = String(req.body?.userId ?? '');
    if (!acceptFriend(req.user.id, fromId)) return res.status(400).json({ error: 'Diese Anfrage gibt es nicht mehr.' });
    hub.notify(fromId, 'friends:changed', { reason: 'accepted', from: req.user.name });
    res.json({ ok: true });
  });

  api.delete('/api/friends/:id', requireUser, (req, res) => {
    removeFriendship(req.user.id, req.params.id);
    hub.notify(req.params.id, 'friends:changed', { reason: 'removed' });
    res.json({ ok: true });
  });

  api.get('/api/status', (_req, res) => {
    res.json({ ok: true, ...hub.stats() });
  });

  return api;
}
