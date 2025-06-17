const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Simulated node options
const nodes = ['Node-1', 'Node-2', 'Node-3'];

// In-memory bot storage
const runningBots = {};

// Return available nodes
app.get('/api/nodes', (req, res) => {
  res.json(nodes);
});

// Return running bots
app.get('/api/bots', (req, res) => {
  const bots = Object.values(runningBots).map(bot => ({
    username: bot.client.user?.username || 'Unknown',
    node: bot.node
  }));
  res.json(bots);
});

// Connect and start a bot
app.post('/api/bots', async (req, res) => {
  const { token, node } = req.body;

  if (!token || !node) {
    return res.status(400).json({ message: 'Token and node are required.' });
  }

  if (runningBots[token]) {
    return res.status(409).json({ message: 'Bot is already running.' });
  }

  try {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    client.once('ready', () => {
      console.log(`✅ Bot ${client.user.tag} connected on ${node}`);
    });

    await client.login(token);

    runningBots[token] = { client, node };
    res.json({ message: 'Bot started successfully.', node, user: client.user.username });
  } catch (err) {
    console.error('❌ Failed to login:', err.message);
    res.status(500).json({ message: 'Invalid bot token or failed to start bot.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
