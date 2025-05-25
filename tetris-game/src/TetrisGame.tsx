import { useState, useEffect, useRef } from 'react'
import './styles/TetrisGame.css'
import GameBoyShell from './GameBoyShell'
import Tetris from './Tetris'

interface TetrisGameProps {
  pausedProp?: boolean // Pour forcer la pause depuis le parent
  onGameOver?: (score: number, level: number) => void // Callback appelé à la fin de la partie (score, level)
  address?: string // Adresse Massa du joueur
  title?: string // Optionnel: titre personnalisé
}

export default function TetrisGame({
  pausedProp = false,
  onGameOver,
  address,
  title = "TETRIS ON MASSA",
}: TetrisGameProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [playingMusic, setPlayingMusic] = useState(true)
  const [paused, setPaused] = useState(pausedProp)
  const [gameOver, setGameOver] = useState(false)
  const [key, setKey] = useState(0) // Force le remontage du composant Tetris

  // start music on first click
  useEffect(() => {
    const start = () => {
      audioRef.current?.play().catch(() => { })
      window.removeEventListener('click', start)
    }
    window.addEventListener('click', start)
    return () => window.removeEventListener('click', start)
  }, [])

  // listen GameBoyShell events
  useEffect(() => {
    const tm = () => setPlayingMusic(m => {
      const next = !m
      if (audioRef.current) audioRef.current.muted = !next
      return next
    })
    const tp = () => {
      if (gameOver) {
        setGameOver(false)
        setPaused(false)
        setKey(k => k + 1)
      } else {
        setPaused(p => !p)
      }
    }

    window.addEventListener('tetris-toggle-music', tm)
    window.addEventListener('tetris-toggle-pause', tp)
    return () => {
      window.removeEventListener('tetris-toggle-music', tm)
      window.removeEventListener('tetris-toggle-pause', tp)
    }
  }, [gameOver])

  // dark mode body class
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode)
    document.body.classList.toggle('light', !darkMode)
  }, [darkMode])

  // clavier : Select = Espace, Start = Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        window.dispatchEvent(new Event('tetris-toggle-music'))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        window.dispatchEvent(new Event('tetris-toggle-pause'))
      }
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setPaused(pausedProp)
  }, [pausedProp])

  // Callback de fin de partie
  function handleGameOver(score: number, level: number) {
    setGameOver(true)
    setPaused(true)
    if (onGameOver) onGameOver(score, level)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">{title}</h1>
        <button
          className="control-btn"
          onClick={() => setDarkMode(d => !d)}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        {address && (
          <span className="player-address" title={address}>
            <b>Adresse :</b> <span className="font-mono">{address}</span>
          </span>
        )}
      </header>

      <GameBoyShell>
        <div className="tetris-container">
          <Tetris
            key={key}
            paused={paused}
            onGameOver={handleGameOver}
            showGameOver={false}
          />
          {gameOver && (
            <div className="game-over-screen">
              <h2>GAME OVER</h2>
              <p>Appuyez sur START pour recommencer</p>
            </div>
          )}
        </div>
      </GameBoyShell>

      <audio
        ref={audioRef}
        src="/tetris.mp3"
        loop
        muted={!playingMusic}
      />
    </div>
  )
}
