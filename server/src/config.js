import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');
const env = process.env;

const port = Number(env.PORT) || 3130;
const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');

// Pfad-Praefix, unter dem Opal laeuft, zum Beispiel "/opal" fuer https://imkirit.dev/opal.
// Standard: der Pfad aus PUBLIC_URL. Leer bedeutet: Opal liegt auf der Domain-Wurzel.
function normalizeBase(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
const basePath = normalizeBase(env.BASE_PATH ?? new URL(publicUrl).pathname);

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  version: '0.1.0',
  port,
  // Live auf 127.0.0.1 setzen, dann ist der Server nur ueber nginx erreichbar
  host: env.HOST || undefined,
  publicUrl,
  basePath,
  secureCookies: publicUrl.startsWith('https://'),
  allowGuests: env.ALLOW_GUESTS !== 'false',
  discord: {
    clientId: env.DISCORD_CLIENT_ID || '',
    clientSecret: env.DISCORD_CLIENT_SECRET || '',
    redirectUri: env.DISCORD_REDIRECT_URI || `${publicUrl}/auth/discord/callback`,
  },
  rankedSections: list(env.RANKED_SECTIONS),
  /** Discord-IDs, die auf der Seite als "Owner" markiert werden */
  ownerDiscordIds: list(env.OWNER_DISCORD_IDS),
  dataDir: env.DATA_DIR || path.join(serverRoot, 'data'),
  packsDir: env.PACKS_DIR || path.join(repoRoot, 'packs'),
  clientDist: env.CLIENT_DIST || path.join(repoRoot, 'client', 'dist'),
};

export const discordEnabled = () => Boolean(config.discord.clientId && config.discord.clientSecret);
