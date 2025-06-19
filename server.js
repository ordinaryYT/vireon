const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const bots = {}; // Active bot instances

// Initialize DB tables
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_tokens (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_commands (
      id SERIAL PRIMARY KEY,
      token TEXT,
      command TEXT,
      enabled BOOLEAN DEFAULT TRUE,
      UNIQUE (token, command)
    );
  `);
})();

const getEnabledCommands = async (token) => {
  const res = await pool.query('SELECT command, enabled FROM bot_commands WHERE token = $1', [token]);
  const cmdMap = {};
  res.rows.forEach(({ command, enabled }) => cmdMap[command] = enabled);
  return cmdMap;
};

const isCommandEnabled = (cmdMap, command) => cmdMap[command] !== false;

app.post('/start-bot', async (req, res) => {
  const { token, userId } = req.body;
  if (!token || !userId) return res.status(400).json({ success: false, message: 'Missing token or user ID.' });

  try {
    if (bots[token]) return res.json({ success: true, message: 'Bot already running.' });

    await pool.query('INSERT INTO bot_tokens (user_id, token) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, token]);

    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });

    const commandStates = await getEnabledCommands(token);

    client.once('ready', () => {
      console.log(`Logged in as ${client.user.tag}`);
    });

    client.on('messageCreate', (message) => {
      if (message.author.bot || !message.content.startsWith('!')) return;
      const [cmd, ...args] = message.content.slice(1).trim().split(/ +/);
      const command = cmd.toLowerCase();

      if (!isCommandEnabled(commandStates, command)) {
        return message.reply(`❌ The command \`${command}\` is disabled.`);
      }

      switch (command) {
        case 'ping': return message.reply('Pong!');
        case 'say': return message.channel.send(args.join(' '));
        case 'help': return message.reply('Available: !ping, !say <text>, !help');
        default: return message.reply('Unknown command.');
      }
    });

    await client.login(token);
    bots[token] = client;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to start bot.' });
  }
});

// Get command states for a bot
app.get('/commands/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await pool.query('SELECT command, enabled FROM bot_commands WHERE token = $1', [token]);
    const commands = {};
    result.rows.forEach(row => commands[row.command] = row.enabled);
    res.json(commands);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch commands' });
  }
});

// Toggle a command
app.post('/commands/toggle', async (req, res) => {
  const { token, command, enabled } = req.body;
  if (!token || !command || typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Missing data.' });
  }

  try {
    await pool.query(`
      INSERT INTO bot_commands (token, command, enabled)
      VALUES ($1, $2, $3)
      ON CONFLICT (token, command)
      DO UPDATE SET enabled = $3
    `, [token, command, enabled]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
