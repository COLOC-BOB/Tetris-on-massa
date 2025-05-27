import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { Args, PublicAPI } from '@massalabs/massa-web3';
import fs from 'fs';

const logFile = './logs/bot.log';
const CALLER_ADDRESS = process.env.CALLER_ADDRESS as string;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as string;
const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID || '';

const client = new PublicAPI('https://buildnet.massa.net/api/v2');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN as string, { polling: true });
log('🤖 Bot lancé');


let previousTop10 = '';
let previousChampion = '';
let previousCagnotte = BigInt(0);
let alertsEnabled = true;

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
}

function formatTop10(data: any[]): string {
  return data.map((entry: any, i: number) =>
    `${i + 1}. ${entry.pseudo || '[anonyme]'} — *${entry.score}* pts, niveau ${entry.level}`
  ).join('\n');
}

async function checkAlerts() {
  if (!alertsEnabled) return;

  try {
    const topRes = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: 'getTop10',
      parameter: new Args().serialize(),
      caller: CALLER_ADDRESS,
    });
    const topJson = new Args(topRes.value).nextString();
    const topCanonical = JSON.stringify(JSON.parse(topJson));

    if (topCanonical !== previousTop10) {
      previousTop10 = topCanonical;
      const topParsed = JSON.parse(topJson);
      const formatted = formatTop10(topParsed);
      bot.sendMessage(ALERT_CHAT_ID, `🚨 *Top 10 mis à jour !*\n\n${formatted}`, { parse_mode: 'Markdown' });
      log('🚨 Top 10 modifié');
    }

    const champRes = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: 'getChampion',
      parameter: new Args().serialize(),
      caller: CALLER_ADDRESS,
    });
    const champJson = new Args(champRes.value).nextString();
    if (champJson !== previousChampion) {
      previousChampion = champJson;
      const champ = JSON.parse(champJson)[0];
      if (champ && champ.score > 0) {
        bot.sendMessage(ALERT_CHAT_ID, `👑 *Nouveau champion !* ${champ.pseudo} avec ${champ.score} pts (niveau ${champ.level})`, { parse_mode: 'Markdown' });
        log(`👑 Nouveau champion : ${champ.pseudo} (${champ.score})`);
      }
    }

    const cagnotteRes = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: 'getCagnotte',
      parameter: new Args().serialize(),
      caller: CALLER_ADDRESS,
    });
    const currentCagnotte = new Args(cagnotteRes.value).nextU64();
    if (currentCagnotte !== previousCagnotte) {
      previousCagnotte = currentCagnotte;
      const mas = Number(currentCagnotte) / 1e9;
      bot.sendMessage(ALERT_CHAT_ID, `💰 *Cagnotte mise à jour* : ${mas} MAS`, { parse_mode: 'Markdown' });
      log(`💰 Nouvelle cagnotte : ${mas} MAS`);
    }
  } catch (err) {
    console.error('Erreur surveillance automatique :', err);
  }
}

setInterval(checkAlerts, 5 * 60 * 1000);

bot.onText(/\/alerts (on|off)/, (msg, match) => {
  log(`📬 /alerts de ${msg.from?.username || msg.chat.id}`);
  const state = match?.[1];
  alertsEnabled = state === 'on';
  bot.sendMessage(msg.chat.id, `🔔 Alertes ${alertsEnabled ? '*activées*' : '*désactivées*'}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/start/, (msg) => {
  log(`📬 /start de ${msg.from?.username || msg.chat.id}`);
  const menu = `
🎮 *Tetris Massa Bot* — Menu des commandes

/status — 💰 Cagnotte actuelle
/tops — 🏆 Voir le Top 10
/champion — 👑 Voir le champion actuel
/timeleft — ⏳ Temps restant
/alerts on|off — 🔔 Activer/désactiver les alertes auto
`;
  bot.sendMessage(msg.chat.id, menu, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, async (msg) => {
  log(`📬 /status de ${msg.from?.username || msg.chat.id}`);
  try {
    const result = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: 'getCagnotte',
      parameter: new Args().serialize(),
      caller: CALLER_ADDRESS,
    });
    const value = new Args(result.value).nextU64();
    const mas = Number(value) / 1e9;
    bot.sendMessage(msg.chat.id, `💰 *Cagnotte actuelle* : ${mas} MAS (${value} nanoMAS)`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    bot.sendMessage(msg.chat.id, `❌ Erreur /status : ${err.message}`);
  }
});

bot.onText(/\/tops/, async (msg) => {
  log(`📬 /tops de ${msg.from?.username || msg.chat.id}`);
  try {
    const result = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: 'getTop10',
      parameter: new Args().serialize(),
      caller: CALLER_ADDRESS,
    });
    const json = new Args(result.value).nextString();
    const data = JSON.parse(json);

    if (!Array.isArray(data) || data.length === 0) {
      bot.sendMessage(msg.chat.id, `🏆 Aucun joueur dans le top 10 pour le moment.`);
      return;
    }

    const formatted = formatTop10(data);
    bot.sendMessage(msg.chat.id, `🏆 *Top 10 actuel* :\n\n${formatted}`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    bot.sendMessage(msg.chat.id, `❌ Erreur /tops : ${err.message}`);
  }
});

bot.onText(/\/champion/, async (msg) => {
  log(`📬 /champion de ${msg.from?.username || msg.chat.id}`);
  try {
    const result = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: 'getChampion',
      parameter: new Args().serialize(),
      caller: CALLER_ADDRESS,
    });
    const json = new Args(result.value).nextString();
    const champ = JSON.parse(json)[0];

    if (!champ || champ.score === 0) {
      bot.sendMessage(msg.chat.id, `👑 Aucun champion pour le moment.`);
      return;
    }

    const date = new Date(champ.timestamp * 1000).toLocaleString('fr-FR');
    const text = `👑 *Champion actuel* :\n\n- Pseudo : ${champ.pseudo || '[anonyme]'}\n- Score  : *${champ.score}*\n- Niveau : ${champ.level}\n- Date   : ${date}`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  } catch (err: any) {
    bot.sendMessage(msg.chat.id, `❌ Erreur /champion : ${err.message}`);
  }
});

bot.onText(/\/timeleft/, async (msg) => {
  log(`📬 /timeleft de ${msg.from?.username || msg.chat.id}`);
  try {
    const result = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: 'getTimeLeft',
      parameter: new Args().serialize(),
      caller: CALLER_ADDRESS,
    });
    const seconds = new Args(result.value).nextU64();

    const h = Math.floor(Number(seconds) / 3600);
    const m = Math.floor((Number(seconds) % 3600) / 60);
    const s = Number(seconds) % 60;

    bot.sendMessage(msg.chat.id, `⏳ *Temps restant* : ${h}h ${m}m ${s}s`, { parse_mode: 'Markdown' });
  } catch (err: any) {
    bot.sendMessage(msg.chat.id, `❌ Erreur /timeleft : ${err.message}`);
  }
});

bot.onText(/\/logs/, async (msg) => {
  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');
    const lastLines = lines.slice(-10).join('\n') || '📭 Aucun log disponible.';

    bot.sendMessage(msg.chat.id, `🗒 *Derniers logs :*\n\n\`\`\`\n${lastLines}\n\`\`\``, {
      parse_mode: 'Markdown',
    });
    log(`📤 /logs envoyé à ${msg.from?.username || msg.chat.id}`);
  } catch (err: any) {
    bot.sendMessage(msg.chat.id, `❌ Erreur /logs : ${err.message}`);
    log(`❌ Erreur lors du /logs : ${err.message}`);
  }
});

