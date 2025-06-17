/*****************************************************************
 *  Vireon – Discord Bot Hosting (Render‑ready, single‑file back‑end)
 *****************************************************************/
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Client, GatewayIntentBits } from 'discord.js';
import pkg from 'pg';
const { Pool } = pkg;

/* ---------- Render environment ---------- */
const PORT          = process.env.PORT || 3000;
const DATABASE_URL  = process.env.DATABASE_URL;   // set automatically by Render
const SSL_OPTION    = { rejectUnauthorized: false }; // Render PG requires SSL

/* ---------- PostgreSQL ---------- */
const pool = new Pool({ connectionString: DATABASE_URL, ssl: SSL_OPTION });

/* Create tables on the first run */
await pool.query(`
  CREATE TABLE IF NOT EXISTS bots (
    id          SERIAL PRIMARY KEY,
    token       TEXT    NOT NULL,
    node        TEXT    NOT NULL,
    username    TEXT    NOT NULL,
    discord_id  TEXT    NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
`);

/* ---------- Express ---------- */
const app = express();
app.use(cors());
app.use(bodyParser.json());

/* ---------- Fake nodes ---------- */
const NODE_LIST = ['Node‑1', 'Node‑2', 'Node‑3'];

/* ---------- In‑memory cache of running bots ---------- */
const runningBots = new Map();  // key: token, value: { client, node }

/* ---------- Utility: start a bot ---------- */
async function startBot(token, node) {
  if (runningBots.has(token)) return runningBots.get(token);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);                             // may throw if bad token

  const botInfo = { client, node };
  runningBots.set(token, botInfo);

  console.log(`✅  ${client.user.tag} connected on ${node}`);
  return botInfo;
}

/* ---------- Restore bots present in DB after a restart ---------- */
(async () => {
  const { rows } = await pool.query('SELECT token, node FROM bots');
  for (const { token, node } of rows) {
    try { await startBot(token, node); }                 // fire‑and‑forget
    catch (e) { console.error('Restore failed:', e.message); }
  }
})();

/* ---------- Routes ---------- */

// serve the single HTML file
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
app.get('/', (_, res) => res.sendFile(__dirname + '/index.html'));

// GET available nodes
app.get('/api/nodes', (_, res) => res.json(NODE_LIST));

// GET bots (live from memory, falls back to DB if none running yet)
app.get('/api/bots', async (_, res) => {
  const live = [...runningBots.values()].map(b => ({
    username : b.client.user.username,
    node     : b.node
  }));
  if (live.length) return res.json(live);

  const { rows } = await pool.query('SELECT username, node FROM bots');
  return res.json(rows);
});

// POST start bot
app.post('/api/bots', async (req, res) => {
  const { token, node } = req.body || {};
  if (!token || !node) return res.status(400).json({ message: 'Token and node required' });
  if (!NODE_LIST.includes(node)) return res.status(400).json({ message: 'Unknown node' });

  try {
    const { client } = await startBot(token, node);

    /* persist to DB if not already saved */
    const exists = await pool.query('SELECT 1 FROM bots WHERE token=$1', [token]);
    if (!exists.rowCount) {
      await pool.query(
        'INSERT INTO bots(token, node, username, discord_id) VALUES($1,$2,$3,$4)',
        [token, node, client.user.username, client.user.id]
      );
    }
    res.json({ username: client.user.username, node });
  } catch (e) {
    console.error('Login failed:', e.message);
    res.status(500).json({ message: 'Bad token or login error' });
  }
});

/* ---------- Launch ---------- */
app.listen(PORT, () => console.log(`🌐  http://localhost:${PORT}`));
