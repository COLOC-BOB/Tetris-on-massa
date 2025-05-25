import {
  Storage,
  Context,
  Address,
  generateEvent
} from '@massalabs/massa-as-sdk';
import { Args } from '@massalabs/as-types';
import { transferCoins } from '@massalabs/massa-as-sdk/assembly/std/coins/transfer';

// === PARAMÈTRES ===
const PERIOD_DURATION: u64 = 172800; // 2 jours
const GAME_COST: u64 = 10_000_000_000; // 10 MAS (nanoMAS)
const TOP_10_SIZE: i32 = 10;
const HISTORY_MAX: i32 = 100;

// === CLÉS DE STOCKAGE ===
const KEY_START_TIMESTAMP = 'startTimestamp';
const KEY_CAGNOTTE = 'cagnotte';
const KEY_CHAMPION = 'champion';
const KEY_PERIOD_OVER = 'periodOver';
const KEY_TOP_10 = 'top10'; // Array JSON [{score,level,address,pseudo,timestamp}]
const KEY_PSEUDO_PREFIX = 'pseudo:';     // "pseudo:ADDR" -> pseudo du joueur
const KEY_ADDR_BY_PSEUDO_PREFIX = 'addrByPseudo:'; // "addrByPseudo:PSEUDO" -> address
const KEY_HISTORY_PREFIX = 'history:'; // "history:ADDR" -> array JSON

function now(): u64 {
  let ms = Context.timestamp();
  let sec = ms / 1000;
  // generateEvent("DEBUG: now_ms=" + ms.toString() + " now_s=" + sec.toString());
  return sec;
}
function keyPseudo(addr: string): string { return KEY_PSEUDO_PREFIX + addr; }
function keyAddrByPseudo(pseudo: string): string { return KEY_ADDR_BY_PSEUDO_PREFIX + pseudo; }
function keyHistory(addr: string): string { return KEY_HISTORY_PREFIX + addr; }

// === INIT (à appeler une seule fois au déploiement) ===
export function constructor(): void {
  let t = now();
  generateEvent("INIT: startTimestamp=" + t.toString());
  Storage.set(KEY_START_TIMESTAMP, now().toString());
  Storage.set(KEY_CAGNOTTE, '0');
  Storage.set(KEY_TOP_10, '[]');
  Storage.set(KEY_PERIOD_OVER, '0');
  Storage.set(KEY_CHAMPION, '');
}

// === Fonction de choix/MAJ du pseudo (doit être unique, non vide) ===
export function choosePseudo(args: StaticArray<u8>): void {
  const parsed = new Args(args);
  const pseudo = parsed.nextString().unwrap();
  assert(pseudo.length > 2 && pseudo.length < 20, "Pseudo trop court/long.");
  assert(!pseudo.includes('"'), "Caractère interdit.");
  assert(!pseudo.includes("'"), "Caractère interdit.");
  assert(!pseudo.includes('{'), "Caractère interdit.");
  assert(!pseudo.includes('}'), "Caractère interdit.");
  let pseudoLC = pseudo.toLowerCase();
  // Vérif unicité (adresse par pseudo)
  assert(!Storage.has(keyAddrByPseudo(pseudoLC)), "Pseudo déjà pris.");
  // Si l'adresse avait déjà un pseudo, le supprimer
  const caller = Context.caller().toString();
  let prev = Storage.has(keyPseudo(caller)) ? Storage.get(keyPseudo(caller)) : "";
  if (prev.length > 0 && Storage.has(keyAddrByPseudo(prev.toLowerCase()))) {
    Storage.del(keyAddrByPseudo(prev.toLowerCase()));
  }

  // Set dans les deux sens
  Storage.set(keyPseudo(caller), pseudo);
  Storage.set(keyAddrByPseudo(pseudoLC), caller);
  generateEvent("choosePseudo called with addr=" + caller + " pseudo=" + pseudo);
}

// === TOP10/HISTORIQUE structures ===
class Top10Entry {
  score: u32;
  level: u8;
  address: string;
  pseudo: string;
  timestamp: u64;

  constructor(score: u32, level: u8, address: string, pseudo: string, timestamp: u64) {
    this.score = score;
    this.level = level;
    this.address = address;
    this.pseudo = pseudo;
    this.timestamp = timestamp;
  }
}

function serializeTop10Json(entries: Top10Entry[]): string {
  let result = "[";
  for (let i = 0; i < entries.length; i++) {
    let entry = entries[i];
    if (i > 0) result += ",";
    result += `{"address":"${entry.address}","pseudo":"${entry.pseudo}",` +
      `"score":${entry.score},"level":${entry.level},"timestamp":${entry.timestamp}}`;
  }
  result += "]";
  return result;
}

// Insert + tri + dédoublonnage adresse + size max
function insertInTop10Json(
  arr: Top10Entry[],
  score: u32,
  level: u8,
  address: string,
  pseudo: string,
  timestamp: u64
): Top10Entry[] {
  arr.push(new Top10Entry(score, level, address, pseudo, timestamp));
  arr.sort((a, b) => {
    if (b.score != a.score) return b.score - a.score;
    if (b.level != a.level) return b.level - a.level;
    return i32(b.timestamp > a.timestamp ? 1 : (b.timestamp < a.timestamp ? -1 : 0));
  });
  let seen = new Map<string, boolean>();
  let uniq: Top10Entry[] = [];
  for (let i = 0; i < arr.length && uniq.length < TOP_10_SIZE; i++) {
    if (!seen.has(arr[i].address)) {
      uniq.push(arr[i]);
      seen.set(arr[i].address, true);
    }
  }
  return uniq;
}

function parseTop10Json(json: string): Top10Entry[] {
  if (!json || json.length < 5) return [];
  let entries: Top10Entry[] = [];
  let objStart = 0;
  let depth = 0;
  for (let i = 0; i < json.length; i++) {
    if (json.charAt(i) === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (json.charAt(i) === '}') {
      depth--;
      if (depth === 0) {
        let objStr = json.substring(objStart, i + 1);
        let score = parseInt(getField(objStr, "score")) as u32;
        let level = parseInt(getField(objStr, "level")) as u8;
        let address = getField(objStr, "address");
        let pseudo = getField(objStr, "pseudo");
        let timestamp = parseInt(getField(objStr, "timestamp")) as u64;
        entries.push(new Top10Entry(score, level, address, pseudo, timestamp));
      }
    }
  }
  return entries;
}

// Utilitaire pour extraire un champ d'un JSON plat {"foo":val, ... }
function getField(json: string, key: string): string {
  let idx = json.indexOf('"' + key + '"');
  if (idx === -1) return "";
  let sep = json.indexOf(':', idx);
  if (sep === -1) return "";
  let start = sep + 1;
  while (json.charAt(start) === ' ' || json.charAt(start) === '"') start++;
  let end = start;
  while (end < json.length && json.charAt(end) !== ',' && json.charAt(end) !== '}') end++;
  let val = json.substring(start, end);
  if (val.endsWith('"')) val = val.substr(0, val.length - 1);
  if (val.startsWith('"')) val = val.substr(1);
  return val;
}

// === FONCTION PRINCIPALE ===
export function play(args: StaticArray<u8>): void {
  const parsed = new Args(args);
  const score = parsed.nextU32().unwrap();
  const level = parsed.nextU8().unwrap();
  assert(Context.transferredCoins() >= GAME_COST, 'Montant insuffisant : 10 MAS');

  let cagnotte = U64.parseInt(Storage.get(KEY_CAGNOTTE));
  cagnotte += Context.transferredCoins();

  // Pseudo actuel
  const caller = Context.caller().toString();
  let pseudo = Storage.has(keyPseudo(caller)) ? Storage.get(keyPseudo(caller)) : "";

  // Charger top 10 (array JSON propre)
  let top10 = parseTop10Json(Storage.get(KEY_TOP_10));

  let startTimestamp = U64.parseInt(Storage.get(KEY_START_TIMESTAMP));
  let periodOver = Storage.get(KEY_PERIOD_OVER).toString() === "1";
  let championAddr = Storage.get(KEY_CHAMPION);

  // === 1. MAJ TOP 10 ===
  top10 = insertInTop10Json(top10, score, level, caller, pseudo, now());
  Storage.set(KEY_TOP_10, serializeTop10Json(top10));

  // === 1b. MAJ HISTORIQUE joueur ===
  let history = parseTop10Json(Storage.has(keyHistory(caller)) ? Storage.get(keyHistory(caller)) : "[]");
  if (history.length >= HISTORY_MAX) history = history.slice(history.length - (HISTORY_MAX - 1));
  if (score > 0) {
    history.push(new Top10Entry(score, level, caller, pseudo, now()));
    Storage.set(keyHistory(caller), serializeTop10Json(history));
  }
  

  // === 2. PHASE 1 MOIS (champion temporaire, update si besoin) ===
  let oldChampionScore = getTopChampionScore(top10);
  if (!periodOver && now() < startTimestamp + PERIOD_DURATION) {
    if (score > oldChampionScore) {
      Storage.set(KEY_CHAMPION, caller);
      generateEvent("NewChampion:" + caller);
    }
    Storage.set(KEY_CAGNOTTE, cagnotte.toString());
    return;
  }

  // === 3. FIN DE PERIODE INITIALE ===
  if (!periodOver && now() >= startTimestamp + PERIOD_DURATION) {
    if (championAddr.length > 0 && cagnotte > 0) {
      transferCoins(new Address(championAddr), cagnotte);
      generateEvent('PremierChampionPayout:' + championAddr + ':' + cagnotte.toString());
      cagnotte = 0;
      Storage.set(KEY_CAGNOTTE, '0');
    }
    Storage.set(KEY_PERIOD_OVER, '1');
    Storage.set(KEY_CHAMPION, '');
  }

  // === 4. ROI DE LA COLLINE ===
  let curTopScore = getTopChampionScore(top10);
  let curChampionAddr = top10.length > 0 ? top10[0].address : "";
  if (score > curTopScore) {
    if (curChampionAddr.length > 0 && cagnotte > 0) {
      transferCoins(new Address(curChampionAddr), cagnotte);
      generateEvent('KingPayout:' + curChampionAddr + ':' + cagnotte.toString());
      cagnotte = 0;
    }
    Storage.set(KEY_CHAMPION, caller);
    generateEvent("NewKing:" + caller);
  }
  Storage.set(KEY_CAGNOTTE, cagnotte.toString());
}

function getTopChampionScore(arr: Top10Entry[]): u32 {
  return arr.length > 0 ? arr[0].score : 0;
}

// === READ-ONLY VIEWS ===

/** Champion : \{address, pseudo, score, level, timestamp\} */
export function getChampion(_args: StaticArray<u8>): StaticArray<u8> {
  let top10 = parseTop10Json(Storage.get(KEY_TOP_10));
  let result = "";
  if (top10.length > 0) {
    let c = top10[0];
    result = serializeTop10Json([c]);
  } else {
    result = serializeTop10Json([new Top10Entry(0, 0, "", "", 0)]);
  }
  return new Args().add(result).serialize();
}

/** Cagnotte en nanoMAS */
export function getCagnotte(_args: StaticArray<u8>): StaticArray<u8> {
  let value = Storage.has(KEY_CAGNOTTE) ? U64.parseInt(Storage.get(KEY_CAGNOTTE)) : 0;
  return new Args().add(value).serialize();
}

/** Top 10 - tableau JSON [\{score, level, address, pseudo, timestamp\}] */
export function getTop10(_args: StaticArray<u8>): StaticArray<u8> {
  let str = Storage.has(KEY_TOP_10) ? Storage.get(KEY_TOP_10) : '[]';
  return new Args().add(str).serialize();
}

/** Historique d'un joueur - tableau JSON [\{score, level, address, pseudo, timestamp\}] */
export function getHistory(args: StaticArray<u8>): StaticArray<u8> {
  const parsed = new Args(args);
  const addr = parsed.nextString().unwrap();
  let str = Storage.has(keyHistory(addr)) ? Storage.get(keyHistory(addr)) : "[]";
  return new Args().add(str).serialize();
}

/** Temps restant en secondes */
export function getTimeLeft(_args: StaticArray<u8>): StaticArray<u8> {
  let end = Storage.has(KEY_START_TIMESTAMP)
    ? U64.parseInt(Storage.get(KEY_START_TIMESTAMP)) + PERIOD_DURATION
    : 0;
  let left = end > now() ? end - now() : 0;
  generateEvent("DEBUG: getTimeLeft end=" + end.toString() + " now=" + now().toString() + " left=" + left.toString());
  return new Args().add(left).serialize();
}

/** Lire pseudo d'un joueur */
export function getPseudo(args: StaticArray<u8>): StaticArray<u8> {
  const address = new Args(args).nextString().unwrap();
  let pseudo = Storage.has(keyPseudo(address)) ? Storage.get(keyPseudo(address)) : "";
  generateEvent("getPseudo: addr=" + address + " pseudo=" + pseudo);
  return new Args().add(pseudo).serialize();
}

/** Vérifier unicité d'un pseudo */
export function isPseudoAvailable(pseudo: string): bool {
  return !Storage.has(keyAddrByPseudo(pseudo.toLowerCase()));
}
