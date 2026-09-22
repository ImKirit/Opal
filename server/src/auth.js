import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { config, discordEnabled } from './config.js';
import { db } from './db.js';
import { createGuest, nameTakenByDiscord, upsertDiscordUser, validateName } from './users.js';

const SESSION_COOKIE = 'opal_sid';
const STATE_COOKIE = 'opal_oauth';
const SESSION_DAYS = 60;

const hash = (token) => createHash('sha256').update(token).digest('hex');

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[key] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: config.basePath || '/',
    maxAge: maxAgeMs,
  };
}

function createSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 86400_000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    hash(token),
    userId,
    now,
    expires,
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 86400_000));
}

const sessionLookup = db.prepare(
  'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
);

export function userFromCookieHeader(header) {
  const token = parseCookies(header)[SESSION_COOKIE];
  if (!token) return null;
  return sessionLookup.get(hash(token), Date.now()) ?? null;
}

export function requireUser(req, res, next) {
  const user = userFromCookieHeader(req.headers.cookie);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet.' });
  req.user = user;
  next();
}

// Sehr einfache Bremse gegen massenhaft angelegte Gast-Accounts.
// Anfragen vom eigenen Rechner (lokale Tests) zaehlen nicht. Hinter nginx liefert
// req.ip dank "trust proxy" die echte Adresse, dort greift die Bremse normal.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const guestHits = new Map();
function guestRateLimited(ip) {
  if (LOOPBACK.has(ip)) return false;
  const now = Date.now();
  const hits = (guestHits.get(ip) || []).filter((t) => now - t < 3600_000);
  hits.push(now);
  guestHits.set(ip, hits);
  return hits.length > 12;
}

export const authRouter = Router();

authRouter.post('/auth/guest', (req, res) => {
  if (!config.allowGuests) return res.status(403).json({ error: 'Gast-Login ist deaktiviert.' });
  if (guestRateLimited(req.ip)) return res.status(429).json({ error: 'Zu viele Gast-Accounts. Versuch es später noch mal.' });
  const { name, error } = validateName(req.body?.name);
  if (error) return res.status(400).json({ error });
  if (nameTakenByDiscord(name)) {
    return res.status(409).json({ error: 'Diesen Namen hat schon ein Discord-Konto. Nimm einen anderen oder melde dich mit Discord an.' });
  }
  const user = createGuest(name);
  createSession(res, user.id);
  res.json({ ok: true });
});

authRouter.post('/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
  res.clearCookie(SESSION_COOKIE, { path: config.basePath || '/' });
  res.json({ ok: true });
});

authRouter.get('/auth/discord', (req, res) => {
  if (!discordEnabled()) return res.redirect(config.basePath + '/?login=discord-off');
  const state = randomBytes(18).toString('base64url');
  res.cookie(STATE_COOKIE, state, cookieOptions(10 * 60_000));
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.discord.clientId,
    scope: 'identify',
    state,
    redirect_uri: config.discord.redirectUri,
    prompt: 'none',
  }).toString();
  res.redirect(url.toString());
});

authRouter.get('/auth/discord/callback', async (req, res) => {
  const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: config.basePath || '/' });
  const { code, state, error } = req.query;
  if (error) return res.redirect(config.basePath + '/?login=abgebrochen');
  if (!code || !state || state !== expected) return res.redirect(config.basePath + '/?login=fehler');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: config.discord.redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token-Tausch fehlgeschlagen (${tokenRes.status})`);
    const token = await tokenRes.json();

    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) throw new Error(`Discord-Profil nicht lesbar (${meRes.status})`);
    const me = await meRes.json();

    const avatar = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.${me.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.id) >> 22n) % 6n)}.png`;

    const current = userFromCookieHeader(req.headers.cookie);
    const user = upsertDiscordUser(
      { discordId: me.id, name: (me.global_name || me.username).slice(0, 32), username: me.username ?? null, avatar },
      current,
    );
    createSession(res, user.id);
    res.redirect(config.basePath + '/');
  } catch (err) {
    console.error('[auth] Discord-Login fehlgeschlagen:', err.message);
    res.redirect(config.basePath + '/?login=fehler');
  }
});

// Abgelaufene Sessions einmal pro Stunde wegraeumen.
setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}, 3600_000).unref();
