import { useEffect, useState, useCallback } from "react";
import { Args, PublicAPI } from "@massalabs/massa-web3";
import { web3 } from "@hicaru/bearby.js";
import TetrisGame from "./TetrisGame";
import "./styles/Home.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const API_URL = import.meta.env.VITE_API_URL || "https://buildnet.massa.net/api/v2";
const SHOW_LOGS = false;

type Top10Entry = {
  score: number;
  level: number;
  address: string;
  pseudo: string;
  timestamp: number;
};

type EventEntry = {
  data: string;
  context: {
    slot: { period: number; thread: number };
    block: string;
    index_in_slot: number;
    call_stack: string[];
  };
  emitter_address: string;
};

type ChampionEntry = Top10Entry;

export default function App() {
  const [address, setAddress] = useState<string>("");
  console.log("Adresse connectée:", address);
  const [pseudo, setPseudo] = useState<string>("");
  console.log("Pseudo retourné:", pseudo);
  const [pseudoInput, setPseudoInput] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [champion, setChampion] = useState<ChampionEntry | null>(null);
  const [cagnotte, setCagnotte] = useState<number>(0);
  const [top10, setTop10] = useState<Top10Entry[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [history, setHistory] = useState<Top10Entry[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string>("");
  const [showPseudoModal, setShowPseudoModal] = useState(false);
  const [pseudoLoading, setPseudoLoading] = useState(false);

  interface ModalPseudoProps {
    open: boolean;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    loading: boolean;
  }

  function ModalPseudo({ open, value, onChange, onSubmit, loading }: ModalPseudoProps) {
    if (!open) return null;
    return (
      <div className="modal-bg">
        <div className="modal-content">
          <h2>Choisis ton pseudo</h2>
          <input
            type="text"
            placeholder="Pseudo (3-20 caractères)"
            maxLength={20}
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button onClick={onSubmit} disabled={loading || value.trim().length < 3}>
            {loading ? "..." : "Valider"}
          </button>
          <p style={{ fontSize: 13, marginTop: 10, color: "#888" }}>
            Le pseudo est lié à ton wallet, il ne pourra plus être changé !
          </p>
        </div>
      </div>
    );
  }

  async function fetchContractEvents() {
    setEventsLoading(true);
    setEventsError("");
    try {
      const body = {
        jsonrpc: "2.0",
        id: 0,
        method: "get_filtered_sc_output_event",
        params: [{ emitter_address: CONTRACT_ADDRESS }]
      };

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!data.result) throw new Error("Pas d'events trouvés !");
      setEvents(data.result);
    } catch (e) {
      setEventsError("Erreur lors de la lecture des events SC : " + (e instanceof Error ? e.message : String(e)));
      setEvents([]);
    }
    setEventsLoading(false);
  }

  useEffect(() => {
    fetchContractEvents();
    const interval = setInterval(fetchContractEvents, 15000);
    return () => clearInterval(interval);
  }, []);

  // Connexion Bearby
  async function connectBearby() {
    setLoading(true); setMessage("");
    try {
      const connected = await web3.wallet.connect();
      if (connected && web3.wallet.account?.base58) {
        setAddress(web3.wallet.account.base58);
        setMessage("Wallet connecté !");
      } else {
        setMessage("Connexion Bearby refusée.");
      }
    } catch (e: unknown) {
      setMessage("Erreur Bearby : " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  }

  // Choisir/Maj pseudo
  async function submitPseudo() {
    setPseudoLoading(true); setMessage("");
    try {
      const args = new Args().addString(pseudoInput.trim());
      await web3.contract.call({
        maxGas: 3_000_000,
        coins: 0,
        fee: 10_000_000,
        targetAddress: CONTRACT_ADDRESS,
        functionName: "choosePseudo",
        unsafeParameters: args.serialize(),
      });

      setPseudoInput("");

      // Boucle d'attente jusqu'à ce que le pseudo soit bien lu côté SC
      let retries = 10;
      while (retries-- > 0) {
        await new Promise(res => setTimeout(res, 2000));
        await fetchData();
        if (pseudo) break;
      }
    } catch (e) {
      setMessage("Erreur choix pseudo : " + (e instanceof Error ? e.message : String(e)));
    }
    setPseudoLoading(false);
  }


  // Lecture infos SC
  const fetchData = useCallback(async () => {
    try {
      const client = new PublicAPI(API_URL);

      // Utilitaire pour lecture JSON propre (une seule entrée ou tableau)
      const safeParse = <T,>(txt: string, fallback: T) => {
        try { return JSON.parse(txt); } catch { return fallback; }
      };

      // Lecture champion (JSON)
      const championJson = await client.executeReadOnlyCall({
        target: CONTRACT_ADDRESS,
        func: "getChampion",
        parameter: new Uint8Array(),
        caller: address || "",
      });
      const championArr = safeParse<ChampionEntry[]>(new TextDecoder().decode(championJson.value), []);
      setChampion(championArr.length ? championArr[0] : null);

      // Lecture pseudo (lecture read-only)
      if (address && address.length > 10) {
        const pseudoRes = await client.executeReadOnlyCall({
          target: CONTRACT_ADDRESS,
          func: "getPseudo",
          parameter: new Args().addString(address).serialize(),
          caller: address,
        });
        let pseudoValue = "";
        if (pseudoRes.value.length !== 0) {
          pseudoValue = new Args(pseudoRes.value).nextString();
        }
        setPseudo(pseudoValue);
        setShowPseudoModal(!pseudoValue && !!address);
      }

      // Cagnotte
      const cagnotteRes = await client.executeReadOnlyCall({
        target: CONTRACT_ADDRESS,
        func: "getCagnotte",
        parameter: new Uint8Array(),
        caller: address || "",
      });
      let cagnotteVal = 0;
      if (cagnotteRes.value.length !== 0) {
        cagnotteVal = Number(new Args(cagnotteRes.value).nextU64()) / 1e9;
      }
      setCagnotte(cagnotteVal);

      // Top 10
      const top10Res = await client.executeReadOnlyCall({
        target: CONTRACT_ADDRESS,
        func: "getTop10",
        parameter: new Uint8Array(),
        caller: address || "",
      });
      let top10Arr: Top10Entry[] = [];
      if (top10Res.value.length !== 0) {
        const top10Json = new Args(top10Res.value).nextString();
        top10Arr = safeParse<Top10Entry[]>(top10Json, []);
      }
      setTop10(top10Arr);

      // Historique joueur (si connecté)
      if (address && address.length > 10) {
        const histRes = await client.executeReadOnlyCall({
          target: CONTRACT_ADDRESS,
          func: "getHistory",
          parameter: new Args().addString(address).serialize(),
          caller: address,
        });
        let histArr: Top10Entry[] = [];
        if (histRes.value.length !== 0) {
          const histJson = new Args(histRes.value).nextString();
          histArr = safeParse<Top10Entry[]>(histJson, []);
        }
        setHistory(histArr);
      } else {
        setHistory([]);
      }

      // Temps restant
      const timeRes = await client.executeReadOnlyCall({
        target: CONTRACT_ADDRESS,
        func: "getTimeLeft",
        parameter: new Uint8Array(),
        caller: address || "",
      });
      let tLeft = 0;
      if (timeRes.value.length !== 0) {
        tLeft = Number(new Args(timeRes.value).nextU64());
      }
      setTimeLeft(tLeft);
    } catch (e) {
      setMessage("Erreur SC : " + (e as Error).toString());
    }
    setMessage(""); // Pas d'erreur affichée
  }, [address]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 6000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Paiement pour jouer
  async function payAndPlay() {
    if (!web3.wallet.connected) return setMessage("Connecte ton wallet Bearby.");
    if (!pseudo) return setMessage("Choisis d'abord un pseudo !");
    setLoading(true); setMessage("");
    try {
      const args = new Args().addU32(BigInt(0)).addU8(BigInt(0));
      await web3.contract.call({
        maxGas: 100_000_000,
        coins: 10_000_000_000,
        fee: 10_000_000,
        targetAddress: CONTRACT_ADDRESS,
        functionName: "play",
        unsafeParameters: args.serialize(),
      });
      setPlaying(true);
      setMessage("");
    } catch (e: unknown) {
      setMessage("Paiement refusé : " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  }

  // Soumission score après partie
  async function onGameOver(finalScore: number, finalLevel: number) {
    if (!web3.wallet.connected) return setMessage("Connecte ton wallet Bearby.");
    setLoading(true); setMessage("");
    try {
      const args = new Args()
        .addU32(BigInt(finalScore))
        .addU8(BigInt(finalLevel));
      await web3.contract.call({
        maxGas: 100_000_000,
        coins: 10_000_000_000,
        fee: 10_000_000,
        targetAddress: CONTRACT_ADDRESS,
        functionName: "play",
        unsafeParameters: args.serialize(),
      });
      setMessage("Score soumis !");
      fetchData();
    } catch (e: unknown) {
      setMessage("Erreur soumission score : " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
    setPlaying(false);
  }

  function formatTimeLeft(sec: number) {
    if (sec <= 0) return "—";
    const days = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${days}j ${h}h ${m}min`;
  }

  function formatDate(timestamp: number) {
    if (!timestamp) return "";
    // Corrige si timestamp en ms ou en secondes
    let t = Number(timestamp);
    if (t > 1e12) t = Math.floor(t / 1000); // Trop gros = probablement ms
    const d = new Date(t * 1000); // timestamp en secondes
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  }


  // Écran jeu Tetris
  if (playing) {
    return <TetrisGame onGameOver={onGameOver} address={address} />;
  }

  return (
    <div className="site-bg">
      <header className="site-header">
        <div className="site-titlebar">
          <span className="site-logo">🎮</span>
          <span className="site-title">Tetris Champion</span>
          <span className="site-sub">sur la blockchain Massa</span>
        </div>
      </header>
      <ModalPseudo
        open={showPseudoModal}
        value={pseudoInput}
        onChange={setPseudoInput}
        onSubmit={submitPseudo}
        loading={pseudoLoading}
      />


      <main className="main-content">
        <section className="hero-card">
          <div className="hero-title">Deviens le prochain champion !</div>
          <div className="hero-desc">
            {pseudo
              ? <>Bienvenue <b style={{ color: '#1e90ff' }}>{pseudo}</b>! Défie la communauté et tente ta chance ! <b>10 MAS</b> par partie.</>
              : <>Connecte ton wallet Bearby, choisis un pseudo, et tente ta chance ! <b>10 MAS</b> par partie.</>
            }
          </div>
          <div className="champion-section">
            <div className="champion-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <span className="champion-avatar" title="Champion">👑</span>
                {champion && (
                  <span>
                    <span className="champion-info">Champion :</span>
                    <span className="champion-addr">{champion.pseudo || champion.address.slice(0, 8)}</span>
                  </span>
                )}
              </div>
              <div className="champion-extra">
                {champion &&
                  <>Score <b>{champion.score}</b> — Niveau <b>{champion.level}</b><br />
                    <span className="champion-date">🏆 {formatDate(champion.timestamp)}</span>
                  </>
                }
              </div>
              <div className="cagnotte-section">
                💰 <span>{cagnotte.toFixed(2)} MAS</span>
                <span className="timer">{formatTimeLeft(timeLeft)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="top10-card">
          <div className="top10-title">Top 10 Joueurs</div>
          <table className="top10-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Pseudo</th>
                <th>Score</th>
                <th>Level</th>
                <th>Date</th>
                <th>Adresse</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((e, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{e.pseudo || e.address.slice(0, 8)}</td>
                  <td>{e.score}</td>
                  <td>{e.level}</td>
                  <td>{formatDate(e.timestamp)}</td>
                  <td title={e.address}>{e.address.slice(0, 6)}…{e.address.slice(-4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {SHOW_LOGS && (
          <section className="logs-card">
            <div className="top10-title">Logs du smart contract</div>
            {eventsLoading ? (
              <div>Chargement…</div>
            ) : eventsError ? (
              <div style={{ color: "red" }}>{eventsError}</div>
            ) : (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Slot</th>
                    <th>Block</th>
                    <th>Event</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev: EventEntry, i: number) => (
                    <tr key={i}>
                      <td>{events.length - i}</td>
                      <td>
                        {ev.context.slot.period}-{ev.context.slot.thread}
                      </td>
                      <td style={{ fontSize: "0.8em" }}>
                        {ev.context.block.slice(0, 8)}…{ev.context.block.slice(-4)}
                      </td>
                      <td style={{ fontFamily: "monospace" }}>{ev.data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        <div className="connect-section">
          {!web3.wallet.installed ? (
            <a
              href="https://chrome.google.com/webstore/detail/bearby/dpkadipdmpddoonoogbbmnhfnbgkmjcc"
              target="_blank"
              rel="noopener noreferrer"
              className="home-btn"
              style={{ background: "#c13" }}
            >
              Installer Bearby Wallet
            </a>
          ) : address ? (
            <>
              <div className="player-address">Connecté : <b>{address}</b></div>
              <button className="home-btn" onClick={payAndPlay} disabled={loading || !pseudo}>
                {loading ? "Paiement..." : "Jouer (10 MAS)"}
              </button>
            </>
          ) : (
            <button className="home-btn" onClick={connectBearby} disabled={loading}>
              {loading ? "Connexion..." : "Connecter mon Bearby Wallet"}
            </button>
          )}
          {message && (!/Invalid params/i.test(message) || web3.wallet.connected) && (
            <div className="home-msg">{message}</div>
          )}
        </div>

        {address && (
          <section className="history-card">
            <div className="top10-title">Mon historique</div>
            <table className="top10-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Score</th>
                  <th>Level</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e, i) => (
                  <tr key={i}>
                    <td>{history.length - i}</td>
                    <td>{e.score}</td>
                    <td>{e.level}</td>
                    <td>{formatDate(e.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}
