import { Account, PublicAPI } from "@massalabs/massa-web3";

// Config via .env
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as string;
const API_URL = import.meta.env.VITE_API_URL as string;
const GAME_COST = 10_000_000_000; // 10 MAS en nanoMAS

export async function connectWallet() {
  // TODO: remplacer par une vraie connexion wallet provider pour production
  const acc = await Account.generate();
  return acc;
}

export async function getSCData(address: string) {
  const client = new PublicAPI(API_URL);
  async function read(fn: string) {
    const result = await client.executeReadOnlyCall({
      target: CONTRACT_ADDRESS,
      func: fn,
      parameter: new Uint8Array(),
      caller: address,
    });
    return new TextDecoder().decode(result.value);
  }
  return {
    champion: await read("getChampion"),
    scoreChampion: Number(await read("getScoreChampion")),
    levelChampion: Number(await read("getLevelChampion")),
    cagnotte: Number(await read("getCagnotte")) / 1e9,
    top10: JSON.parse(await read("getTop10")),
    timeLeft: Number(await read("getTimeLeft")),
  };
}

export async function payAndPlay(wallet: Account) {
  const client = new PublicAPI(API_URL);
  const data = new TextEncoder().encode(
    JSON.stringify({
      maxGas: 10_000_000,
      coins: GAME_COST,
      targetAddress: CONTRACT_ADDRESS,
      targetFunction: "play",
      parameter: "00000000",
    })
  );
  await client.sendOperation({
    data,
    publicKey: wallet.publicKey.toString(),
    signature: (await wallet.sign(data)).toString(),
  });
}

export async function submitScore(wallet: Account, score: number, level: number) {
  const client = new PublicAPI(API_URL);
  const scoreHex = score.toString(16).padStart(8, "0");
  const levelHex = level.toString(16).padStart(2, "0");
  const parameter = scoreHex + levelHex;
  const data = new TextEncoder().encode(
    JSON.stringify({
      maxGas: 10_000_000,
      coins: 0,
      targetAddress: CONTRACT_ADDRESS,
      targetFunction: "play",
      parameter,
    })
  );
  await client.sendOperation({
    data,
    publicKey: wallet.publicKey.toString(),
    signature: (await wallet.sign(data)).toString(),
  });
}
