const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Client, GatewayIntentBits } = require('discord.js');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const SSL_OPTION = { rejectUnauthorized: false };

const pool = new Pool({ connectionString: DATABASE_URL, ssl: SSL_OPTION });

app.use(cors());
app.use(bodyParser.json());

const NODE_LIST = ['Node-1', 'Node-2', 'Node-3'];
const runningBots = new Map();

async function startBot(token, node) {
  if (runningBots.has(token)) return runningBots.get(token);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  const botInfo = { client, node };
  runningBots.set(token, botInfo);
  console.log(`✅ ${client.user.tag} connected on ${node}`);
  return botInfo;
}

// Restore on boot
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bots (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL,
        node TEXT NOT NULL,
        username TEXT NOT NULL,
        discord_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    const { rows } = await pool.query('SELECT token, node FROM bots');
    for (const { token, node } of rows) {
      try {
        await startBot(token, node);
      } catch (e) {
        console.error('Restore failed for token', token, e.message);
      }
    }
  } catch (err) {
    console.error('Database error:', err);
  }
})();

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/nodes', (_, res) => {
  res.json(NODE_LIST);
});

app.get('/api/bots', async (_, res) => {
  const live = [...runningBots.values()].map(b => ({
    username: b.client.user.username,
    node: b.node,
  }));
  if (live.length) return res.json(live);

  const { rows } = await pool.query('SELECT username, node FROM bots');
  return res.json(rows);
});

app.post('/api/bots', async (req, res) => {
  const { token, node } = req.body || {};
  if (!token || !node) return res.status(400).json({ message: 'Token and node required' });

  try {
    const { client } = await startBot(token, node);
    const exists = await pool.query('SELECT 1 FROM bots WHERE token = $1', [token]);

    if (!exists.rowCount) {
      await pool.query(
        'INSERT INTO bots (token, node, username, discord_id) VALUES ($1, $2, $3, $4)',
        [token, node, client.user.username, client.user.id]
      );
    }

    res.json({ username: client.user.username, node });
  } catch (e) {
    console.error('Login failed:', e.message);
    res.status(500).json({ message: 'Bad token or login error' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
