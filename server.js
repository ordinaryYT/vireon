require('dotenv').config();
const express = require('express');
const { Client, Intents } = require('discord.js');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = express();
const path = require('path');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-strong-secret-key';
const BOT_HOSTING_PORT = process.env.BOT_PORT || 3001;

// Active bot clients
const activeBots = new Map();

// Initialize database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS bots (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS commands (
        id SERIAL PRIMARY KEY,
        bot_id VARCHAR(255) REFERENCES bots(id),
        command_name VARCHAR(50) NOT NULL,
        command_response TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}

// Start hosting a bot
async function startBotHosting(botToken, userId) {
  try {
    const client = new Client({ 
      intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGES
      ] 
    });

    await client.login(botToken);
    
    // Store the bot client
    activeBots.set(client.user.id, client);
    
    // Basic event handlers
    client.on('messageCreate', async message => {
      if (message.author.bot) return;
      
      // Check for commands in the database
      const { rows } = await pool.query(
        'SELECT * FROM commands WHERE bot_id = $1 AND $2 LIKE command_name',
        [client.user.id, message.content]
      );
      
      if (rows.length > 0) {
        message.reply(rows[0].command_response);
      }
    });

    // Update bot status in DB
    await pool.query(
      'UPDATE bots SET status = $1 WHERE id = $2',
      ['online', client.user.id]
    );

    return {
      id: client.user.id,
      name: client.user.username,
      status: 'online'
    };
  } catch (err) {
    console.error('Bot startup failed:', err);
    throw new Error('Failed to start bot');
  }
}

// API Endpoints

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { rows } = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );
    
    const token = jwt.sign({ id: rows[0].id, email }, JWT_SECRET);
    res.json({ token, user: rows[0] });
  } catch (err) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, rows[0].password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: rows[0].id, email }, JWT_SECRET);
    res.json({ token, user: { id: rows[0].id, email } });
  } catch (err) {
    res.status(400).json({ error: 'Login failed' });
  }
});

// Connect a new bot
app.post('/api/bots', async (req, res) => {
  try {
    const { token } = req.body;
    const user = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
    
    const bot = await startBotHosting(token, user.id);
    
    // Save to database
    await pool.query(
      'INSERT INTO bots (id, user_id, name, token, status) VALUES ($1, $2, $3, $4, $5)',
      [bot.id, user.id, bot.name, token, bot.status]
    );
    
    res.json(bot);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get user's bots
app.get('/api/bots', async (req, res) => {
  try {
    const user = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT * FROM bots WHERE user_id = $1',
      [user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bots' });
  }
});

// Add command to bot
app.post('/api/commands', async (req, res) => {
  try {
    const { botId, commandName, commandResponse } = req.body;
    const user = jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET);
    
    // Verify user owns the bot
    const { rows } = await pool.query(
      'SELECT 1 FROM bots WHERE id = $1 AND user_id = $2',
      [botId, user.id]
    );
    
    if (rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const result = await pool.query(
      'INSERT INTO commands (bot_id, command_name, command_response) VALUES ($1, $2, $3) RETURNING *',
      [botId, commandName, commandResponse]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Failed to add command' });
  }
});

// Start server
initDB().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API server running on port ${PORT}`);
  });
  
  // Start bot hosting server on different port
  app.listen(BOT_HOSTING_PORT, () => {
    console.log(`Bot hosting server running on port ${BOT_HOSTING_PORT}`);
  });
});
