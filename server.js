const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

const activeBots = {};

app.post('/start-bot', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'Token is required.' });

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.once('ready', () => {
      console.log(`✅ Bot ready: ${client.user.tag}`);
    });

    client.on('messageCreate', msg => {
      if (msg.author.bot) return;

      const args = msg.content.trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === '!ping') {
        msg.reply('Pong!');
      } else if (command === '!hello') {
        msg.reply(`Hello, ${msg.author.username}!`);
      } else if (command === '!say') {
        const message = args.join(' ');
        if (!message) return msg.reply('Please provide a message.');
        msg.channel.send(message);
      } else if (command === '!userinfo') {
        msg.reply(`Username: ${msg.author.username}\nID: ${msg.author.id}`);
      } else if (command === '!help') {
        msg.reply('Available commands: !ping, !hello, !say <msg>, !userinfo, !help, !time, !server, !bot');
      } else if (command === '!time') {
        msg.reply(`Current server time: ${new Date().toLocaleString()}`);
      } else if (command === '!server') {
        msg.reply(`Server name: ${msg.guild.name}\nMembers: ${msg.guild.memberCount}`);
      } else if (command === '!bot') {
        msg.reply(`I am ${client.user.username}, and I’m running smoothly!`);
      }
    });

    await client.login(token);
    activeBots[token] = client;

    res.json({ success: true, message: 'Bot connected.' });
  } catch (err) {
    console.error('❌ Bot failed:', err);
    res.status(401).json({ success: false, message: 'Invalid token or error logging in.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
