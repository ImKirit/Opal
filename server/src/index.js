import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { config, discordEnabled } from './config.js';
import './db.js';
import { authRouter } from './auth.js';
import { createApiRouter } from './api.js';
import { loadPacks } from './packs.js';
import { attachHub } from './game/hub.js';

const packs = loadPacks();
const questionTotal = packs.reduce((n, p) => n + p.sections.reduce((m, s) => m + s.count, 0), 0);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '16kb' }));

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  path: `${config.basePath}/socket.io`,
  serveClient: false,
  pingInterval: 10000,
  pingTimeout: 8000,
});
const hub = attachHub(io);

// Alles haengt unter dem Pfad-Praefix (live "/opal", lokal meist leer). nginx reicht den
// Praefix unveraendert durch, wie bei den anderen Apps auf imkirit.dev.
const site = express.Router();
site.use(authRouter);
site.use(createApiRouter(hub));
site.use(['/api', '/auth'], (_req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

// Gebauten Client ausliefern. Der Build muss denselben Praefix kennen (npm run build:live).
if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  site.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  site.get(/^(?!\/(api|auth|socket\.io)\b).*/, (_req, res) => {
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
}
app.use(config.basePath || '/', site);
if (config.basePath) app.get('/', (_req, res) => res.redirect(`${config.basePath}/`));

app.use((err, _req, res, _next) => {
  console.error('[http]', err);
  res.status(500).json({ error: 'Serverfehler.' });
});

server.listen(config.port, config.host, () => {
  console.log(`[opal] Server läuft auf Port ${config.port} (${config.publicUrl})`);
  console.log(`[opal] ${packs.length} Pakete, ${questionTotal} Fragen geladen`);
  console.log(`[opal] Discord-Login: ${discordEnabled() ? 'aktiv' : 'aus (Zugangsdaten fehlen)'}, Gäste: ${config.allowGuests ? 'erlaubt' : 'aus'}`);
});

const shutdown = () => {
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
