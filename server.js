require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { Client, Intents } = require('discord.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(express.json());

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// API ROUTES

// Signup
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
            [email, hashedPassword]
        );
        const token = jwt.sign({ id: result.rows[0].id, email }, JWT_SECRET);
        res.json({ token, user: result.rows[0] });
    } catch (err) {
        res.status(400).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
        res.status(400).json({ error: 'Login failed' });
    }
});

// Auth middleware
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Get current user
app.get('/api/me', authenticate, async (req, res) => {
    res.json({ id: req.user.id, email: req.user.email });
});

// Add a bot
app.post('/api/bots', authenticate, async (req, res) => {
    try {
        const { token } = req.body;
        const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

        await client.login(token);
        const result = await pool.query(
            'INSERT INTO bots (id, user_id, name, token, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [client.user.id, req.user.id, client.user.username, token, 'online']
        );
        client.destroy();

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Bot connection failed:', err);
        res.status(400).json({ error: 'Invalid bot token' });
    }
});

// Get user's bots
app.get('/api/bots', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM bots WHERE user_id = $1',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch bots' });
    }
});

// ✅ Serve the index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ✅ Optional: serve static assets if you ever add CSS/JS
// app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB & start server
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
        `);
        console.log('Database initialized');
    } catch (err) {
        console.error('Database initialization failed:', err);
    }
}

initDB().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
