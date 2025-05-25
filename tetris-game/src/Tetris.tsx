import { useState, useEffect, useCallback, useRef } from 'react'
import './styles/Tetris.css'

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20
const INITIAL_DROP = 800
const SPEED_FACTOR = 0.95

type Cell = 0 | string
type Shape = number[][]
type Tetromino = { shape: Shape; color: string }
type Piece = { x: number; y: number; tetromino: Tetromino }

const TETROMINOS: Record<string, Tetromino> = {
  I: { shape: [[1, 1, 1, 1]], color: 'cyan-500' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: 'blue-500' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: 'orange-500' },
  O: { shape: [[1, 1], [1, 1]], color: 'yellow-500' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: 'green-500' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: 'purple-500' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: 'red-500' },
}

const COLOR_MAP: Record<string, string> = {
  'cyan-500': '#06b6d4', 'blue-500': '#3b82f6', 'orange-500': '#f97316',
  'yellow-500': '#facc15', 'green-500': '#22c55e', 'purple-500': '#a855f7',
  'red-500': '#ef4444'
}

const createBoard = (): Cell[][] =>
  Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0))

const randomTetromino = (): Tetromino => {
  const keys = Object.keys(TETROMINOS)
  return TETROMINOS[keys[Math.floor(Math.random() * keys.length)]]
}

interface TetrisProps {
  paused?: boolean;
  onGameOver: (score: number, level: number) => void;
  showGameOver?: boolean;
}

export default function Tetris({ paused, onGameOver, showGameOver = true }: TetrisProps) {
  const [board, setBoard] = useState<Cell[][]>(createBoard())
  const [piece, setPiece] = useState<Piece | null>(null)
  const [nextPiece, setNextPiece] = useState<Tetromino>(randomTetromino())
  const [dropTime, setDropTime] = useState(INITIAL_DROP)
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lines, setLines] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const gameOverSent = useRef(false)

  // keep a stable ref for move() inside intervals
  const moveRef = useRef<(dx: number, dy: number) => void>(() => { })

  const checkCollision = useCallback((x: number, y: number, shape: Shape) => {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const nx = x + c, ny = y + r
          if (nx < 0 || nx >= BOARD_WIDTH || ny >= BOARD_HEIGHT ||
            (ny >= 0 && board[ny][nx] !== 0)) return true
        }
      }
    }
    return false
  }, [board])

  const spawn = useCallback(() => {
    const np: Piece = { x: 4, y: 0, tetromino: nextPiece }
    setNextPiece(randomTetromino())
    if (checkCollision(np.x, np.y, np.tetromino.shape)) {
      setGameOver(true)
      if (!gameOverSent.current) {
        onGameOver(score, level)
        gameOverSent.current = true
      }
    } else {
      setPiece(np)
    }
  }, [checkCollision, nextPiece, onGameOver, score, level])

  const clearLines = useCallback((b: Cell[][]) => {
    const full = b.filter(row => row.every(c => c !== 0)).length
    if (!full) return
    const points = [0, 40, 100, 300, 1200][full] * level
    setScore(s => s + points)
    setLines(l => l + full)
    const newLevel = Math.floor((lines + full) / 10) + 1
    if (newLevel > level) {
      setLevel(newLevel)
      setDropTime(t => t * SPEED_FACTOR)
    }
    const filtered = b.filter(r => !r.every(c => c !== 0))
    while (filtered.length < BOARD_HEIGHT)
      filtered.unshift(Array(BOARD_WIDTH).fill(0))
    setBoard(filtered)
  }, [level, lines])

  const place = useCallback(() => {
    if (!piece) return
    const b = board.map(r => [...r])
    piece.tetromino.shape.forEach((row, dy) =>
      row.forEach((v, dx) => {
        if (v) {
          const yy = piece.y + dy, xx = piece.x + dx
          if (yy >= 0 && yy < BOARD_HEIGHT && xx >= 0 && xx < BOARD_WIDTH)
            b[yy][xx] = piece.tetromino.color
        }
      })
    )
    setBoard(b)
    clearLines(b)
    spawn()
  }, [board, piece, clearLines, spawn])

  const move = useCallback((dx: number, dy: number) => {
    if (piece && !checkCollision(piece.x + dx, piece.y + dy, piece.tetromino.shape)) {
      setPiece(p => p && ({ ...p, x: p.x + dx, y: p.y + dy }))
    } else if (dy && piece) {
      place()
    }
  }, [piece, checkCollision, place])

  const rotate = useCallback(() => {
    if (!piece) return
    const s = piece.tetromino.shape
    const rot = s[0].map((_, i) => s.map(r => r[i]).reverse())
    if (!checkCollision(piece.x, piece.y, rot)) {
      setPiece(p => p && ({ ...p, tetromino: { ...p.tetromino, shape: rot } }))
    }
  }, [piece, checkCollision])

  const resetGame = useCallback(() => {
    setBoard(createBoard())
    setPiece(null)
    setNextPiece(randomTetromino())
    setScore(0)
    setLevel(1)
    setLines(0)
    setDropTime(INITIAL_DROP)
    setGameOver(false)
    gameOverSent.current = false
  }, [])

  // update moveRef each render
  useEffect(() => { moveRef.current = move }, [move])

  // spawn initial piece
  useEffect(() => {
    if (!piece && !gameOver) spawn()
  }, [piece, spawn, gameOver])

  // continuous drop
  useEffect(() => {
    if (paused || gameOver) return
    const id = setInterval(() => moveRef.current(0, 1), dropTime)
    return () => clearInterval(id)
  }, [dropTime, paused, gameOver])

  // keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (paused || gameOver) return
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault(); move(-1, 0); break
        case 'ArrowRight':
          e.preventDefault(); move(1, 0); break
        case 'ArrowDown':
          e.preventDefault(); move(0, 1); break
        case 'ArrowUp':
          e.preventDefault(); rotate(); break
      }
    }
    window.addEventListener('keydown', handleKey, { passive: false })
    return () => window.removeEventListener('keydown', handleKey)
  }, [paused, gameOver, move, rotate])

  // shell events
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      left: () => !paused && !gameOver && move(-1, 0),
      right: () => !paused && !gameOver && move(1, 0),
      down: () => !paused && !gameOver && move(0, 1),
      rotate: () => !paused && !gameOver && rotate(),
      'toggle-pause': () => {
        if (gameOver) {
          resetGame()
        }
      }
    }
    Object.entries(handlers).forEach(([e, fn]) =>
      window.addEventListener(`tetris-${e}`, fn)
    )
    return () => Object.entries(handlers).forEach(([e, fn]) =>
      window.removeEventListener(`tetris-${e}`, fn)
    )
  }, [move, rotate, resetGame, gameOver, paused])

  const cellValue = (x: number, y: number): Cell =>
    piece && piece.tetromino.shape[y - piece.y]?.[x - piece.x]
      ? piece.tetromino.color
      : board[y][x]

  return (
    <div className="tetris-wrapper">
      <div className="stats">
        <div>SCORE<br />{score}</div>
        <div>LEVEL<br />{level}</div>
        <div>LINES<br />{lines}</div>
        <div>NEXT</div>
        <div className="next-grid">
          {Array.from({ length: 4 }).flatMap((_, y) =>
            Array.from({ length: 4 }).map((_, x) => (
              <div key={`${x}-${y}`} style={{
                backgroundColor: nextPiece.shape[y]?.[x]
                  ? COLOR_MAP[nextPiece.color]
                  : 'transparent'
              }} />
            ))
          )}
        </div>
      </div>
      <div className="tetris-grid">
        {board.map((row, y) =>
          row.map((_, x) => (
            <div key={`${x}-${y}`} style={{
              backgroundColor: cellValue(x, y)
                ? COLOR_MAP[cellValue(x, y)]
                : '#f3f4f6'
            }} />
          ))
        )}
        {showGameOver && gameOver && (
          <div className="game-over">GAME OVER<br />PRESS START</div>
        )}
        {!gameOver && paused && (
          <div className="paused">PAUSED</div>
        )}
      </div>
    </div>
  )
}
