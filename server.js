const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
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
        GatewayIntentBits.GuildMembers,
      ],
    });

    client.once('ready', () => {
      console.log(`✅ Bot ready: ${client.user.tag}`);
    });

    client.on('messageCreate', async (msg) => {
      if (msg.author.bot) return;
      const args = msg.content.trim().split(/ +/);
      const command = args.shift().toLowerCase();

      // ==== General Commands ====
      if (command === '!ping') msg.reply('Pong!');
      else if (command === '!hello') msg.reply(`Hello, ${msg.author.username}!`);
      else if (command === '!say') msg.channel.send(args.join(' ') || 'You didn’t say anything!');
      else if (command === '!userinfo') msg.reply(`Username: ${msg.author.tag}\nID: ${msg.author.id}`);
      else if (command === '!time') msg.reply(`Current server time: ${new Date().toLocaleString()}`);
      else if (command === '!bot') msg.reply(`I am ${client.user.username}, and I’m alive!`);
      else if (command === '!server') msg.reply(`Server: ${msg.guild.name}\nMembers: ${msg.guild.memberCount}`);
      else if (command === '!help') msg.reply('See full command list on the website under "Commands" tab.');
      else if (command === '!avatar') msg.reply(msg.author.displayAvatarURL({ dynamic: true }));
      else if (command === '!dm') {
        const text = args.join(' ');
        if (!text) return msg.reply('Please provide a message.');
        msg.author.send(text).then(() => msg.reply('📬 DM sent!')).catch(() => msg.reply('❌ Failed to send DM.'));
      }

      // ==== Moderation Commands ====
      else if (command === '!kick') {
        if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply('No permission.');
        const member = msg.mentions.members.first();
        if (member) {
          await member.kick();
          msg.reply(`${member.user.tag} has been kicked.`);
        } else msg.reply('Mention someone to kick.');
      }

      else if (command === '!ban') {
        if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply('No permission.');
        const member = msg.mentions.members.first();
        if (member) {
          await member.ban();
          msg.reply(`${member.user.tag} has been banned.`);
        } else msg.reply('Mention someone to ban.');
      }

      else if (command === '!unban') {
        const userTag = args[0];
        if (!userTag) return msg.reply('Provide userTag like User#1234');
        const bans = await msg.guild.bans.fetch();
        const user = bans.find(u => `${u.user.username}#${u.user.discriminator}` === userTag);
        if (!user) return msg.reply('User not found in bans.');
        await msg.guild.members.unban(user.user.id);
        msg.reply(`${userTag} unbanned.`);
      }

      else if (command === '!mute') {
        const member = msg.mentions.members.first();
        if (!member) return msg.reply('Mention a user to mute.');
        await member.timeout(600000); // 10 minutes
        msg.reply(`${member.user.tag} muted for 10 minutes.`);
      }

      else if (command === '!unmute') {
        const member = msg.mentions.members.first();
        if (!member) return msg.reply('Mention a user to unmute.');
        await member.timeout(null);
        msg.reply(`${member.user.tag} unmuted.`);
      }

      else if (command === '!clear') {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) return msg.reply('Enter number 1–100');
        await msg.channel.bulkDelete(amount, true);
        msg.reply(`🧹 Cleared ${amount} messages.`).then(m => setTimeout(() => m.delete(), 3000));
      }

      else if (command === '!warn') {
        const member = msg.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'No reason';
        if (!member) return msg.reply('Mention someone to warn.');
        msg.reply(`${member.user.tag} has been warned: ${reason}`);
      }

      else if (command === '!infractions') {
        const member = msg.mentions.members.first() || msg.member;
        msg.reply(`${member.user.tag} has 0 infractions. (Feature placeholder)`);
      }

      else if (command === '!lock') {
        msg.channel.permissionOverwrites.create(msg.guild.roles.everyone, { SendMessages: false });
        msg.reply('🔒 Channel locked.');
      }

      else if (command === '!unlock') {
        msg.channel.permissionOverwrites.create(msg.guild.roles.everyone, { SendMessages: true });
        msg.reply('🔓 Channel unlocked.');
      }

      // ==== Fun Commands ====
      else if (command === '!meme') {
        const res = await fetch('https://meme-api.com/gimme');
        const json = await res.json();
        msg.channel.send(`${json.title}\n${json.url}`);
      }

      else if (command === '!joke') {
        const res = await fetch('https://v2.jokeapi.dev/joke/Any');
        const json = await res.json();
        const joke = json.type === 'single' ? json.joke : `${json.setup}\n${json.delivery}`;
        msg.reply(joke);
      }

      else if (command === '!8ball') {
        const responses = ['Yes.', 'No.', 'Maybe.', 'Definitely.', 'Ask again later.'];
        msg.reply(responses[Math.floor(Math.random() * responses.length)]);
      }

      else if (command === '!roll') {
        msg.reply(`🎲 You rolled a ${Math.floor(Math.random() * 6) + 1}`);
      }

      else if (command === '!flip') {
        msg.reply(Math.random() > 0.5 ? 'Heads' : 'Tails');
      }

      else if (command === '!cat') {
        const res = await fetch('https://api.thecatapi.com/v1/images/search');
        const json = await res.json();
        msg.channel.send(json[0].url);
      }

      else if (command === '!dog') {
        const res = await fetch('https://dog.ceo/api/breeds/image/random');
        const json = await res.json();
        msg.channel.send(json.message);
      }

      else if (command === '!rate') {
        const user = msg.mentions.users.first() || msg.author;
        msg.reply(`${user.username} is a ${Math.floor(Math.random() * 11)}/10`);
      }

      else if (command === '!simprate') {
        msg.reply(`Simp rate: ${Math.floor(Math.random() * 101)}% 💖`);
      }

      else if (command === '!howgay') {
        msg.reply(`You are ${Math.floor(Math.random() * 101)}% gay 🌈`);
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
